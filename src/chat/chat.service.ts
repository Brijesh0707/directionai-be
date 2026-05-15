import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentRunStatus, ChatSessionStatus, Prisma } from '@prisma/client';
import { Subject } from 'rxjs';
import { AgentService } from '../agent/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListSessionSummariesDto } from './dto/list-session-summaries.dto';

export type ChatStreamEvent = {
  type: 'session' | 'agent';
  chatId: string;
  message: string;
  progress: number;
  status: string;
  agentType?: string;
  runId?: string;
  timestamp: string;
};

@Injectable()
export class ChatService {
  private readonly streamMap = new Map<string, Subject<ChatStreamEvent>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
  ) {}

  private getStream(chatId: string): Subject<ChatStreamEvent> {
    const current = this.streamMap.get(chatId);
    if (current) return current;
    const created = new Subject<ChatStreamEvent>();
    this.streamMap.set(chatId, created);
    return created;
  }

  getSessionStream(chatId: string): Subject<ChatStreamEvent> {
    return this.getStream(chatId);
  }

  async createSession(userId: string, idea: string, title?: string) {
    const cleanIdea = idea?.trim();
    if (!cleanIdea) throw new BadRequestException('idea is required');

    const normalizedTitle = (title?.trim() || cleanIdea.split(/[.!?]/)[0] || 'Untitled Project').slice(0, 80);

    return this.prisma.chatSession.create({
      data: {
        userId,
        idea: cleanIdea,
        title: normalizedTitle,
        status: ChatSessionStatus.draft,
        progress: 5,
      },
      include: {
        agentRuns: true,
      },
    });
  }

  async listSessions(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      include: { agentRuns: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listSessionSummaries(userId: string, query: ListSessionSummariesDto) {
    const page = Number.isFinite(Number(query.page)) ? Math.max(1, Number(query.page)) : 1;
    const limit = Number.isFinite(Number(query.limit))
      ? Math.min(50, Math.max(1, Number(query.limit)))
      : 12;
    const search = query.search?.trim();
    const skip = (page - 1) * limit;

    const where: Prisma.ChatSessionWhereInput = {
      userId,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { idea: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.chatSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          idea: true,
          createdAt: true,
        },
      }),
      this.prisma.chatSession.count({ where }),
    ]);

    const items = sessions.map((session) => ({
      id: session.id,
      title: session.title,
      description: session.idea.slice(0, 180),
      createdAt: session.createdAt,
    }));

    return {
      items,
      page,
      limit,
      total,
      hasMore: skip + items.length < total,
    };
  }

  async getSession(userId: string, chatId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: chatId },
      include: { agentRuns: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) throw new NotFoundException('Chat session not found');
    if (session.userId !== userId) throw new ForbiddenException('Not allowed');
    return session;
  }

  async runAgents(userId: string, chatId: string, agentTypes: string[]) {
    const session = await this.getSession(userId, chatId);

    const normalizedTypes = Array.from(
      new Set(agentTypes.map((type) => type.trim().toUpperCase()).filter(Boolean)),
    );

    if (!normalizedTypes.length) throw new BadRequestException('agentTypes is required');

    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { status: ChatSessionStatus.running, progress: 10 },
    });

    this.emit(chatId, {
      type: 'session',
      chatId,
      message: 'Execution started',
      progress: 10,
      status: 'running',
    });

    const total = normalizedTypes.length;
    let completed = 0;

    for (const agentType of normalizedTypes) {
      const run = await this.prisma.agentRun.create({
        data: {
          chatSessionId: chatId,
          agentType,
          status: AgentRunStatus.running,
          startedAt: new Date(),
        },
      });

      this.emit(chatId, {
        type: 'agent',
        chatId,
        runId: run.id,
        agentType,
        message: `${agentType} started`,
        progress: this.computeProgress(completed, total),
        status: 'running',
      });

      try {
        const result = await this.agentService.runAgent(agentType, session.idea, (event) => {
          this.emit(chatId, {
            type: 'agent',
            chatId,
            runId: run.id,
            agentType: event.agentType,
            message: `[${event.agentType}] ${event.message}`,
            progress: this.computeAgentAwareProgress(completed, total, event.progress),
            status: 'running',
          });
        });
        await this.prisma.agentRun.update({
          where: { id: run.id },
          data: {
            status: AgentRunStatus.completed,
            finishedAt: new Date(),
            resultJson: this.toJsonInput(result),
            reportPath: null,
            reportName: null,
          },
        });

        completed += 1;
        const progress = this.computeProgress(completed, total);
        await this.prisma.chatSession.update({
          where: { id: chatId },
          data: {
            progress,
            status: completed === total ? ChatSessionStatus.completed : ChatSessionStatus.running,
          },
        });

        this.emit(chatId, {
          type: 'agent',
          chatId,
          runId: run.id,
          agentType,
          message: `${agentType} completed`,
          progress,
          status: 'completed',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown agent error';

        await this.prisma.agentRun.update({
          where: { id: run.id },
          data: {
            status: AgentRunStatus.failed,
            finishedAt: new Date(),
            errorMessage: message,
          },
        });

        await this.prisma.chatSession.update({
          where: { id: chatId },
          data: { status: ChatSessionStatus.failed },
        });

        this.emit(chatId, {
          type: 'agent',
          chatId,
          runId: run.id,
          agentType,
          message: `${agentType} failed: ${message}`,
          progress: this.computeProgress(completed, total),
          status: 'failed',
        });

        throw error;
      }
    }

    this.emit(chatId, {
      type: 'session',
      chatId,
      message: 'Execution completed',
      progress: 100,
      status: 'completed',
    });

    return this.getSession(userId, chatId);
  }

  async listReports(userId: string, chatId: string) {
    await this.getSession(userId, chatId);

    const runs = await this.prisma.agentRun.findMany({
      where: { chatSessionId: chatId, status: AgentRunStatus.completed },
      orderBy: { createdAt: 'desc' },
    });

    return runs.map((run) => ({
      runId: run.id,
      agentType: run.agentType,
      reportName: run.reportName,
      hasDownload: Boolean(run.reportPath),
      hasJson: Boolean(run.resultJson),
      createdAt: run.createdAt,
    }));
  }

  async getRunResult(userId: string, chatId: string, runId: string) {
    await this.getSession(userId, chatId);

    const run = await this.prisma.agentRun.findUnique({ where: { id: runId } });
    if (!run || run.chatSessionId !== chatId) {
      throw new NotFoundException('Run not found');
    }

    return run;
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private computeProgress(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, Math.max(10, Math.round((completed / total) * 100)));
  }

  private computeAgentAwareProgress(completed: number, total: number, agentProgress: number): number {
    if (total === 0) return 0;
    const bounded = Math.min(100, Math.max(0, agentProgress));
    const aggregate = ((completed + bounded / 100) / total) * 100;
    return Math.min(99, Math.max(10, Math.round(aggregate)));
  }

  private emit(chatId: string, payload: Omit<ChatStreamEvent, 'timestamp'>) {
    this.getStream(chatId).next({
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}
