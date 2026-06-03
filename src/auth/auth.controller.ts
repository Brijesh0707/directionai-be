import {
  Body,
  Controller,
  Headers,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CreateRazorpayOrderDto } from './dto/create-razorpay-order.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyRazorpayPaymentDto } from './dto/verify-razorpay-payment.dto';
import { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthUser } from './types/auth-user.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('google')
  google(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/request')
  requestPasswordReset(@Body() dto: ForgotPasswordRequestDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password/reset')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPasswordWithOtp(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request & { user: AuthUser }) {
    return this.authService.me(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('onboarding')
  onboarding(@Req() req: Request & { user: AuthUser }, @Body() dto: OnboardingDto) {
    return this.authService.updateOnboarding(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('plans')
  plans() {
    return this.authService.getPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Post('plans/purchase')
  purchasePlan(@Req() req: Request & { user: AuthUser }, @Body() dto: CreateRazorpayOrderDto) {
    return this.authService.createRazorpayOrder(req.user.sub, dto.planCode);
  }

  @UseGuards(JwtAuthGuard)
  @Post('plans/verify')
  verifyPlan(@Req() req: Request & { user: AuthUser }, @Body() dto: VerifyRazorpayPaymentDto) {
    return this.authService.verifyRazorpayPayment(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('razorpay/webhook')
  handleRazorpayWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    return this.authService.handleRazorpayWebhook(req.body, signature);
  }
}
