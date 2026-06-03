import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UnauthorizedException,
  Res,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/types/auth-user.type';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { DownloadReportDto } from './dto/download-report.dto';
import { ListSessionSummariesDto } from './dto/list-session-summaries.dto';
import { RunAgentsDto } from './dto/run-agents.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  createSession(@Req() req: Request & { user: AuthUser }, @Body() dto: CreateChatDto) {
    return this.chatService.createSession(req.user.sub, dto.idea, dto.title);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  listSessions(@Req() req: Request & { user: AuthUser }) {
    return this.chatService.listSessions(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('entitlement')
  getEntitlement(@Req() req: Request & { user: AuthUser }) {
    return this.chatService.getProjectEntitlement(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/summary')
  listSessionSummaries(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListSessionSummariesDto,
  ) {
    return this.chatService.listSessionSummaries(req.user.sub, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/:chatId')
  getSession(@Req() req: Request & { user: AuthUser }, @Param('chatId') chatId: string) {
    return this.chatService.getSession(req.user.sub, chatId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/:chatId/run')
  runAgents(
    @Req() req: Request & { user: AuthUser },
    @Param('chatId') chatId: string,
    @Body() dto: RunAgentsDto,
  ) {
    return this.chatService.runAgents(req.user.sub, chatId, dto.agentTypes);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/:chatId/message')
  sendMessage(
    @Req() req: Request & { user: AuthUser },
    @Param('chatId') chatId: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chatService.sendMessage(req.user.sub, chatId, dto.message);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/:chatId/reports')
  listReports(@Req() req: Request & { user: AuthUser }, @Param('chatId') chatId: string) {
    return this.chatService.listReports(req.user.sub, chatId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/:chatId/usage')
  getUsage(@Req() req: Request & { user: AuthUser }, @Param('chatId') chatId: string) {
    return this.chatService.getUsage(req.user.sub, chatId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions/:chatId/runs/:runId')
  getRunResult(
    @Req() req: Request & { user: AuthUser },
    @Param('chatId') chatId: string,
    @Param('runId') runId: string,
  ) {
    return this.chatService.getRunResult(req.user.sub, chatId, runId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions/:chatId/reports/:runId/download')
  async downloadReport(
    @Req() req: Request & { user: AuthUser },
    @Param('chatId') chatId: string,
    @Param('runId') runId: string,
    @Body() dto: DownloadReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, fileName } = await this.chatService.downloadReport(
      req.user.sub,
      chatId,
      runId,
      dto.html,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return new StreamableFile(buffer);
  }

  @Sse('sessions/:chatId/stream')
  async streamSession(
    @Param('chatId') chatId: string,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    const tokenFromHeader = this.extractBearer(req.headers.authorization);
    const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
    const token = tokenFromHeader || tokenFromQuery;

    if (!token) {
      throw new UnauthorizedException('Missing token for stream');
    }

    let payload: AuthUser;
    try {
      payload = this.jwtService.verify<AuthUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid stream token');
    }

    await this.chatService.getSession(payload.sub, chatId);

    return this.chatService.getSessionStream(chatId).pipe(
      map((event) => ({ data: event })),
    );
  }

  private extractBearer(value?: string): string | undefined {
    const [type, token] = value?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
