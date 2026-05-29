import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth-user.type';
import { ChatService } from './chat.service';

@Controller('share')
export class PublicShareController {
  constructor(private readonly chatService: ChatService) {}

  @UseGuards(JwtAuthGuard)
  @Get('sessions/:chatId')
  getProjectShare(
    @Req() req: Request & { user: AuthUser },
    @Param('chatId') chatId: string,
  ) {
    return this.chatService.getProjectShare(req.user.sub, chatId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('sessions/:chatId')
  updateProjectShare(
    @Req() req: Request & { user: AuthUser },
    @Param('chatId') chatId: string,
    @Body() body: { isPublic?: boolean },
  ) {
    return this.chatService.updateProjectShare(
      req.user.sub,
      chatId,
      body.isPublic === true,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch('sessions/:chatId/reports/:runId')
  updateReportShare(
    @Req() req: Request & { user: AuthUser },
    @Param('chatId') chatId: string,
    @Param('runId') runId: string,
    @Body() body: { isPublic?: boolean },
  ) {
    return this.chatService.updateReportShare(
      req.user.sub,
      chatId,
      runId,
      body.isPublic === true,
    );
  }

  @Get('project/:token')
  getPublicProject(@Param('token') token: string) {
    return this.chatService.getPublicProject(token);
  }

  @Get('report/:token')
  getPublicReport(@Param('token') token: string) {
    return this.chatService.getPublicReport(token);
  }
}
