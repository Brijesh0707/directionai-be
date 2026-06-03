import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, User } from '@prisma/client';
import { createHmac, randomBytes, randomInt } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();
  private readonly logger = new Logger(AuthService.name);
  private readonly passwordResetOtpExpiryMinutes = Number(
    process.env.PASSWORD_RESET_OTP_EXPIRY_MINUTES ?? 10,
  );
  private readonly razorpayKeyId = process.env.RAZORPAY_KEY_ID ?? '';
  private readonly razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
  private readonly razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  private readonly projectPlans = {
    PROJECT_20: {
      code: 'PROJECT_20',
      name: '20 Project Pack',
      projects: 20,
      priceInr: 500,
      pricePerProjectInr: 25,
    },
    PROJECT_30: {
      code: 'PROJECT_30',
      name: '30 Project Pack',
      projects: 30,
      priceInr: 750,
      pricePerProjectInr: 25,
    },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: dto.name,
        provider: AuthProvider.email,
      },
    });

    const response = await this.buildAuthResponse(user);
    void this.emailService.sendWelcomeEmail({
      email: response.user.email,
      name: response.user.name,
    });
    return response;
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid email or password');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password');

    return this.buildAuthResponse(user);
  }

  async googleLogin(dto: GoogleLoginDto) {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) throw new BadRequestException('GOOGLE_CLIENT_ID is not configured');
    this.logger.log('Google login attempt received');

    let payload:
      | {
          email?: string;
          sub?: string;
          name?: string;
          picture?: string;
        }
      | undefined;

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.logger.error('Google token verification failed', error);
      throw new UnauthorizedException(
        'Google token verification failed. Check Google client ID and allowed origins.',
      );
    }

    if (!payload?.email || !payload.sub) {
      this.logger.warn('Google payload missing required fields');
      throw new UnauthorizedException('Invalid Google token');
    }

    const normalizedEmail = payload.email.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: payload.name,
          avatarUrl: payload.picture,
          provider: AuthProvider.google,
          googleId: payload.sub,
        },
      });
      void this.emailService.sendWelcomeEmail({
        email: user.email,
        name: user.name,
      });
    } else if (!user.googleId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: payload.sub,
          provider: AuthProvider.google,
          avatarUrl: payload.picture ?? user.avatarUrl,
          name: payload.name ?? user.name,
        },
      });
    }

    this.logger.log(`Google login success for ${normalizedEmail}`);
    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user?.refreshTokenHash) throw new UnauthorizedException('Invalid refresh token');

    const tokenOk = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!tokenOk) throw new UnauthorizedException('Invalid refresh token');

    return this.buildAuthResponse(user);
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { refreshTokenHash: null },
    });
    return { success: true, message: 'Logged out successfully' };
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.passwordHash) {
      throw new NotFoundException('No password-based account found for this email');
    }

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    await this.prisma.passwordResetOtp.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    await this.prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        email: user.email,
        otpHash,
        expiresAt: new Date(Date.now() + this.passwordResetOtpExpiryMinutes * 60 * 1000),
      },
    });

    void this.emailService.sendPasswordResetOtpEmail({
      email: user.email,
      name: user.name,
      otp,
      expiresInMinutes: this.passwordResetOtpExpiryMinutes,
    });

    return {
      message: 'A one-time password has been sent to your email address.',
      expiresInMinutes: this.passwordResetOtpExpiryMinutes,
    };
  }

  async resetPasswordWithOtp(dto: ResetPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.passwordHash) {
      throw new NotFoundException('No password-based account found for this email');
    }

    const resetRecord = await this.findValidPasswordResetOtp(user.id, normalizedEmail);
    if (!resetRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const otpMatches = await bcrypt.compare(dto.otp, resetRecord.otpHash);
    if (!otpMatches) {
      await this.incrementPasswordResetAttempts(resetRecord.id);
      throw new BadRequestException('Invalid or expired OTP');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.passwordResetOtp.update({
        where: { id: resetRecord.id },
        data: {
          verifiedAt: new Date(),
          usedAt: new Date(),
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          refreshTokenHash: null,
        },
      }),
    ]);

    return {
      message: 'Password reset successfully. Please log in again.',
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitizeUser(user);
  }

  async updateOnboarding(userId: string, dto: OnboardingDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        onboardingUserType: dto.userType,
        onboardingSource: dto.source,
        onboardingGoal: dto.goal,
        onboardingStage: dto.stage,
        onboardingDone: true,
      },
    });

    return { user: this.sanitizeUser(user), message: 'Onboarding saved' };
  }

  getPlans() {
    return {
      free: {
        name: 'Free',
        includedProjects: 1,
        note: 'First project is free and includes all 4 agents.',
      },
      paid: Object.values(this.projectPlans),
      pricingBasis: {
        operationalCostPerProjectInr: 20,
        marginPerProjectInr: 5,
        billedPerProjectInr: 25,
      },
    };
  }

  async purchasePlan(userId: string, planCode: 'PROJECT_20' | 'PROJECT_30') {
    return this.createRazorpayOrder(userId, planCode);
  }

  async createRazorpayOrder(userId: string, planCode: 'PROJECT_20' | 'PROJECT_30') {
    const selectedPlan = this.projectPlans[planCode];
    if (!selectedPlan) throw new BadRequestException('Invalid plan code');

    if (!this.razorpayKeyId || !this.razorpayKeySecret) {
      throw new BadRequestException('Razorpay is not configured');
    }

    const recentPendingOrder = await this.prisma.razorpayOrder.findFirst({
      where: {
        userId,
        planCode,
        status: 'created',
        createdAt: {
          gte: new Date(Date.now() - 10 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentPendingOrder) {
      return {
        message: `${selectedPlan.name} checkout is ready.`,
        plan: selectedPlan,
        order: this.mapRazorpayOrder(recentPendingOrder),
        razorpayKeyId: this.razorpayKeyId,
      };
    }

    const amountPaise = selectedPlan.priceInr * 100;
    const receipt = `rcpt_${planCode.toLowerCase()}_${Date.now()}_${randomBytes(4).toString('hex')}`;

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${this.razorpayKeyId}:${this.razorpayKeySecret}`,
        ).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        payment_capture: 1,
        notes: {
          userId,
          planCode,
          planName: selectedPlan.name,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Razorpay order creation failed: ${errorText}`);
      throw new BadRequestException('Unable to create Razorpay order');
    }

    const razorpayOrder = (await response.json()) as {
      id: string;
      receipt?: string;
    };

    const createdOrder = await this.prisma.razorpayOrder.create({
      data: {
        userId,
        planCode,
        planName: selectedPlan.name,
        amountInr: selectedPlan.priceInr,
        amountPaise,
        projects: selectedPlan.projects,
        receipt: razorpayOrder.receipt ?? receipt,
        orderId: razorpayOrder.id,
        status: 'created',
      },
    });

    return {
      message: `${selectedPlan.name} checkout is ready.`,
      plan: selectedPlan,
      order: this.mapRazorpayOrder(createdOrder),
      razorpayKeyId: this.razorpayKeyId,
    };
  }

  async verifyRazorpayPayment(
    userId: string,
    dto: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ) {
    const order = await this.prisma.razorpayOrder.findFirst({
      where: {
        userId,
        orderId: dto.razorpayOrderId,
      },
    });

    if (!order) {
      throw new NotFoundException('Razorpay order not found');
    }

    const selectedPlan = this.projectPlans[order.planCode as 'PROJECT_20' | 'PROJECT_30'];
    if (!selectedPlan) {
      throw new BadRequestException('Invalid plan code');
    }

    if (!this.verifyRazorpaySignature(dto)) {
      await this.prisma.razorpayOrder.update({
        where: { id: order.id },
        data: {
          status: 'failed',
          paymentId: dto.razorpayPaymentId,
          signature: dto.razorpaySignature,
          errorMessage: 'Invalid Razorpay signature',
        },
      });

      throw new BadRequestException('Payment signature validation failed');
    }

    return {
      ...(await this.finalizeRazorpayPayment(order, {
        paymentId: dto.razorpayPaymentId,
        source: 'checkout',
      })),
    };
  }

  async handleRazorpayWebhook(rawBody: Buffer | string, signature?: string) {
    if (!this.razorpayWebhookSecret) {
      throw new BadRequestException('Razorpay webhook is not configured');
    }

    const payloadText = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : typeof rawBody === 'string'
        ? rawBody
        : JSON.stringify(rawBody);

    const expectedSignature = createHmac('sha256', this.razorpayWebhookSecret)
      .update(payloadText)
      .digest('hex');

    if (!signature || signature !== expectedSignature) {
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }

    const event = JSON.parse(payloadText) as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
          };
        };
        order?: {
          entity?: {
            id?: string;
          };
        };
      };
    };

    const eventName = event.event ?? '';
    const paymentEntity = event.payload?.payment?.entity;
    const orderEntity = event.payload?.order?.entity;
    const orderId = paymentEntity?.order_id ?? orderEntity?.id;
    const paymentId = paymentEntity?.id;

    if (!orderId) {
      return { received: true, ignored: true };
    }

    const order = await this.prisma.razorpayOrder.findFirst({
      where: { orderId },
    });

    if (!order) {
      return { received: true, ignored: true };
    }

    if (order.status === 'paid') {
      return {
        received: true,
        ignored: true,
        message: 'Order already processed',
      };
    }

    if (eventName !== 'payment.captured' && eventName !== 'order.paid') {
      return { received: true, ignored: true };
    }

    return {
      ...(await this.finalizeRazorpayPayment(order, {
        paymentId: paymentId ?? order.paymentId ?? '',
        source: 'webhook',
      })),
    };
  }

  private async finalizeRazorpayPayment(
    order: {
      id: string;
      userId: string;
      planCode: string;
      planName: string;
      amountInr: number;
      amountPaise: number;
      projects: number;
      receipt: string;
      orderId: string;
      paymentId?: string | null;
      signature?: string | null;
      status: string;
      paidAt?: Date | null;
      errorMessage?: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    params: {
      paymentId: string;
      source: 'checkout' | 'webhook';
    },
  ) {
    const selectedPlan = this.projectPlans[order.planCode as 'PROJECT_20' | 'PROJECT_30'];
    if (!selectedPlan) {
      throw new BadRequestException('Invalid plan code');
    }

    if (order.status === 'paid') {
      const user = await this.prisma.user.findUnique({ where: { id: order.userId } });
      if (!user) throw new NotFoundException('User not found');

      return {
        message: 'Payment already verified.',
        plan: selectedPlan,
        order: this.mapRazorpayOrder(order),
        user: this.sanitizeUser(user),
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const orderUpdate = await tx.razorpayOrder.updateMany({
        where: {
          id: order.id,
          status: 'created',
        },
        data: {
          status: 'paid',
          paymentId: params.paymentId || order.paymentId || null,
          paidAt: new Date(),
          errorMessage: null,
        },
      });

      if (orderUpdate.count === 0) {
        const currentOrder = await tx.razorpayOrder.findUnique({
          where: { id: order.id },
        });
        const currentUser = await tx.user.findUnique({ where: { id: order.userId } });
        return {
          alreadyProcessed: true,
          order: currentOrder ?? order,
          user: currentUser,
        };
      }

      const updatedUser = await tx.user.update({
        where: { id: order.userId },
        data: {
          planTier: 'project_bundle',
          projectCredits: {
            increment: selectedPlan.projects,
          },
        },
      });

      const updatedOrder = await tx.razorpayOrder.findUnique({
        where: { id: order.id },
      });

      return {
        alreadyProcessed: false,
        order: updatedOrder ?? order,
        user: updatedUser,
      };
    });

    if (!result.user) {
      throw new NotFoundException('User not found');
    }

    if (!result.alreadyProcessed) {
      void this.emailService.sendSubscriptionActivatedEmail({
        email: result.user.email,
        name: result.user.name,
        planName: selectedPlan.name,
        projects: selectedPlan.projects,
        amountInr: selectedPlan.priceInr,
        receipt: order.receipt,
      });
    }

    return {
      message: result.alreadyProcessed
        ? 'Payment already verified.'
        : `${selectedPlan.name} activated successfully.`,
      plan: selectedPlan,
      order: this.mapRazorpayOrder(result.order),
      user: this.sanitizeUser(result.user),
    };
  }

  private async buildAuthResponse(user: User) {
    const tokens = await this.generateTokens(user.id, user.email);
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return {
      user: this.sanitizeUser(updatedUser),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      message: 'Authentication successful',
    };
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as never,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as never,
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<{ sub: string; email: string }> {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private sanitizeUser(user: User) {
    const { passwordHash, refreshTokenHash, ...safeUser } = user;
    return safeUser;
  }

  private mapRazorpayOrder(order: {
    id: string;
    userId: string;
    planCode: string;
    planName: string;
    amountInr: number;
    amountPaise: number;
    projects: number;
    receipt: string;
    orderId: string;
    paymentId?: string | null;
    signature?: string | null;
    status: string;
    paidAt?: Date | null;
    errorMessage?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: order.id,
      userId: order.userId,
      planCode: order.planCode,
      planName: order.planName,
      amountInr: order.amountInr,
      amountPaise: order.amountPaise,
      projects: order.projects,
      receipt: order.receipt,
      orderId: order.orderId,
      paymentId: order.paymentId ?? null,
      signature: order.signature ?? null,
      status: order.status,
      paidAt: order.paidAt ?? null,
      errorMessage: order.errorMessage ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private verifyRazorpaySignature(payload: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) {
    const expectedSignature = createHmac('sha256', this.razorpayKeySecret)
      .update(`${payload.razorpayOrderId}|${payload.razorpayPaymentId}`)
      .digest('hex');

    return expectedSignature === payload.razorpaySignature;
  }

  private generateOtp() {
    return randomInt(100000, 1000000).toString();
  }

  private async findValidPasswordResetOtp(userId: string, email: string) {
    return this.prisma.passwordResetOtp.findFirst({
      where: {
        userId,
        email,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async incrementPasswordResetAttempts(resetId: string) {
    await this.prisma.passwordResetOtp.update({
      where: { id: resetId },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });
  }
}
