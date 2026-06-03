import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth-user.type';
import { FeedbackService } from './feedback.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @UseGuards(JwtAuthGuard)
  @Post('bug')
  async createBugReport(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: CreateBugReportDto,
  ) {
    return this.feedbackService.createBugReport(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('bugs')
  async listBugReports(@Req() req: Request & { user: AuthUser }) {
    return this.feedbackService.listBugReports(req.user.sub);
  }
}
