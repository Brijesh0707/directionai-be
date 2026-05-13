import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, User } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        provider: AuthProvider.email,
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
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

    let user = await this.prisma.user.findUnique({ where: { email: payload.email } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: payload.email,
          name: payload.name,
          avatarUrl: payload.picture,
          provider: AuthProvider.google,
          googleId: payload.sub,
        },
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

    this.logger.log(`Google login success for ${payload.email}`);
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
}
