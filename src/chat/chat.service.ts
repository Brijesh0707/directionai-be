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
        const memorySummary = this.buildAgentSummary(agentType, result);
        const resultWithMemory = this.attachSummaryToResult(result, memorySummary);

        await this.prisma.agentRun.update({
          where: { id: run.id },
          data: {
            status: AgentRunStatus.completed,
            finishedAt: new Date(),
            resultJson: this.toJsonInput(resultWithMemory),
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
          message: `${agentType} completed. Summary saved to chat memory.`,
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

  private attachSummaryToResult(result: unknown, summary: string): Record<string, unknown> {
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return {
        ...(result as Record<string, unknown>),
        __memorySummary: summary,
        __memoryUpdatedAt: new Date().toISOString(),
      };
    }

    return {
      payload: result,
      __memorySummary: summary,
      __memoryUpdatedAt: new Date().toISOString(),
    };
  }

  private buildAgentSummary(agentType: string, result: unknown): string {
    const root = result && typeof result === 'object' ? (result as Record<string, unknown>) : null;
    const lines: string[] = [];
    lines.push(`### ${agentType} Summary`);

    if (agentType === 'RESEARCH') {
      const merged = this.asString(root?.mergedResponse);
      const summary = this.asRecord(root?.summarizedRequest);
      const topic = this.asString(summary?.topic);
      const audience = this.asString(summary?.audience);
      const intent = this.asString(summary?.intent);
      const competitors = this.asStringArray(summary?.competitors).slice(0, 4);
      if (topic) lines.push(`- Topic: ${topic}`);
      if (audience) lines.push(`- Audience: ${audience}`);
      if (intent) lines.push(`- Objective: ${intent}`);
      if (competitors.length) lines.push(`- Competitor set: ${competitors.join(', ')}`);
      if (merged) lines.push(`- Key findings: ${merged}`);
      return lines.join('\n');
    }

    if (agentType === 'DEVELOPMENT') {
      const structure = this.asRecord(root?.response_structure);
      const finalSummary = this.asRecord(structure?.final_development_summary);
      const execSummary = this.asString(finalSummary?.execution_summary);
      const timeline = this.asString(finalSummary?.estimated_timeline);
      const buildOrder = this.asStringArray(finalSummary?.build_order).slice(0, 4);
      if (execSummary) lines.push(`- Execution summary: ${execSummary}`);
      if (timeline) lines.push(`- Estimated timeline: ${timeline}`);
      if (buildOrder.length) lines.push(`- Build order: ${buildOrder.join(' -> ')}`);
      return lines.join('\n');
    }

    if (agentType === 'MARKETING') {
      const structure = this.asRecord(root?.response_structure);
      const idea = this.asRecord(structure?.idea_understanding);
      const audience = this.asRecord(structure?.target_audience);
      const platform = this.asRecord(structure?.platform_strategy);
      const execution = this.asRecord(structure?.execution_priority);
      const finalSummary = this.asRecord(structure?.final_summary);

      const businessSummary = this.asString(idea?.business_summary);
      const uvp = this.asString(idea?.unique_value_proposition);
      const primaryAudience = this.asStringArray(audience?.primary_audience).slice(0, 3);
      const channel = this.asString(finalSummary?.recommended_acquisition_channel);
      const strategy = this.asString(finalSummary?.recommended_primary_strategy);
      const recommendation = this.asString(finalSummary?.final_strategic_recommendation);
      const quickWins = this.asStringArray(execution?.quick_wins).slice(0, 3);
      const priorities = this.asStringArray(platform?.platform_priority_order).slice(0, 4);

      if (businessSummary) lines.push(`- Business snapshot: ${businessSummary}`);
      if (uvp) lines.push(`- Value proposition: ${uvp}`);
      if (primaryAudience.length) lines.push(`- Core audience: ${primaryAudience.join(', ')}`);
      if (channel) lines.push(`- Recommended acquisition channel: ${channel}`);
      if (strategy) lines.push(`- Primary growth strategy: ${strategy}`);
      if (priorities.length) lines.push(`- Platform priority: ${priorities.join(' -> ')}`);
      if (quickWins.length) lines.push(`- Quick wins: ${quickWins.join(' | ')}`);
      if (recommendation) lines.push(`- Strategic recommendation: ${recommendation}`);

      if (lines.length === 1) {
        lines.push('- Marketing plan generated, but key fields were missing in the payload.');
      }
      return lines.join('\n');
    }

    if (agentType === 'PPT') {
      const title = this.asString(root?.title);
      const plan = this.asRecord(root?.slidePlan);
      const slides = plan?.slides;
      const count = Array.isArray(slides) ? slides.length : 0;
      const categorized = this.asRecord(root?.categorizedRequest);
      const objective = this.asString(categorized?.objective);
      const audience = this.asString(categorized?.audience);
      const keyPoints = this.asStringArray(categorized?.keyPoints).slice(0, 4);
      if (title) lines.push(`- Deck title: ${title}`);
      if (audience) lines.push(`- Target audience: ${audience}`);
      if (objective) lines.push(`- Deck objective: ${objective}`);
      if (keyPoints.length) lines.push(`- Key narrative points: ${keyPoints.join(' | ')}`);
      lines.push(`- Slides prepared: ${count}`);
      lines.push('- Investor-ready slide content, visuals, and render map generated.');
      return lines.join('\n');
    }

    lines.push(`- ${JSON.stringify(result)}`);
    return lines.join('\n');
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()));
  }

}
