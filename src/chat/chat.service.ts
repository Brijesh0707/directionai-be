import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AgentRunStatus, ChatSessionStatus, Prisma } from '@prisma/client';
import { Subject } from 'rxjs';
import { AgentService } from '../agent/agent.service';
import { DirectionAiAgentService } from '../agent/directionai.agent';
import type {
  DirectionAiConversationItem,
  DirectionAiMemory,
  DirectionAiResponse,
} from '../agent/types/directionai-memory.type';
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
    private readonly directionAiAgent: DirectionAiAgentService,
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
    await this.assertUserCanCreateProject(userId);

    const normalizedTitle = (
      title?.trim() ||
      cleanIdea.split(/[.!?]/)[0] ||
      'Untitled Project'
    ).slice(0, 80);

    const session = await this.prisma.chatSession.create({
      data: {
        userId,
        rawIdea: cleanIdea,
        idea: cleanIdea,
        title: normalizedTitle,
        status: ChatSessionStatus.draft,
        progress: 5,
      },
      include: {
        agentRuns: true,
      },
    });

    const directionResponse = await this.directionAiAgent.analyze(
      cleanIdea,
      null,
      {
        chatSessionId: session.id,
        agentType: 'DIRECTIONAI',
        callLabel: 'directionai.intake',
      },
    );

    const directionMemory = this.buildInitialDirectionMemory(
      cleanIdea,
      directionResponse,
    );
    const refinedTitle = this.normalizeProjectName(
      directionResponse.projectName,
    );
    const refinedDescription = this.normalizeProjectDescription(
      directionResponse.projectDescription,
    );

    return this.prisma.chatSession.update({
      where: { id: session.id },
      data: {
        title: refinedTitle,
        idea: refinedDescription,
        projectCategory: directionResponse.projectCategory,
        recommendedFirstAgent: directionResponse.recommendedFirstAgent,
        memoryJson: this.toJsonInput(directionMemory),
      },
      include: {
        agentRuns: true,
      },
    });
  }

  async getProjectEntitlement(userId: string) {
    const [user, projectCount] = await this.prisma.$transaction([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.chatSession.count({ where: { userId } }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    const freeRemaining = Math.max(0, 1 - projectCount);
    const paidRemaining = Math.max(0, user.projectCredits);
    const remainingProjects = freeRemaining + paidRemaining;

    return {
      planTier: user.planTier,
      freeProjectsIncluded: 1,
      projectsCreated: projectCount,
      paidCreditsRemaining: paidRemaining,
      remainingProjects,
      canCreateProject: remainingProjects > 0,
      note: 'All 4 agents run on every project. Free tier includes only first project.',
    };
  }

  async listSessions(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      include: { agentRuns: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listSessionSummaries(userId: string, query: ListSessionSummariesDto) {
    const page = Number.isFinite(Number(query.page))
      ? Math.max(1, Number(query.page))
      : 1;
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

  async sendMessage(userId: string, chatId: string, message: string) {
    const session = await this.getSession(userId, chatId);
    const cleanMessage = message?.trim();

    if (!cleanMessage) {
      throw new BadRequestException('message is required');
    }

    const memory = this.readDirectionMemory(session.memoryJson);
    const updatedConversation = [
      ...memory.conversation,
      this.createConversationItem('user', 'reply', cleanMessage),
    ];

    const directionResponse = await this.directionAiAgent.analyze(
      cleanMessage,
      {
        ...memory,
        conversation: updatedConversation,
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        chatSessionId: chatId,
        agentType: 'DIRECTIONAI',
        callLabel: 'directionai.reply',
      },
    );

    const nextMemory = this.applyDirectionResponse(
      memory,
      cleanMessage,
      directionResponse,
    );

    const refinedTitle = this.normalizeProjectName(
      directionResponse.projectName || session.title,
    );
    const refinedDescription = this.normalizeProjectDescription(
      directionResponse.projectDescription || session.idea,
    );

    const updatedSession = await this.prisma.chatSession.update({
      where: { id: chatId },
      data: {
        title: refinedTitle,
        idea: refinedDescription,
        projectCategory:
          directionResponse.projectCategory || session.projectCategory,
        recommendedFirstAgent:
          directionResponse.recommendedFirstAgent ||
          session.recommendedFirstAgent,
        memoryJson: this.toJsonInput(nextMemory),
      },
      include: {
        agentRuns: { orderBy: { createdAt: 'asc' } },
      },
    });

    return {
      message: directionResponse.assistantMessage,
      session: updatedSession,
    };
  }

  async runAgents(userId: string, chatId: string, agentTypes: string[]) {
    const session = await this.getSession(userId, chatId);

    const normalizedTypes = Array.from(
      new Set(
        agentTypes.map((type) => type.trim().toUpperCase()).filter(Boolean),
      ),
    );

    if (!normalizedTypes.length)
      throw new BadRequestException('agentTypes is required');

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
        const result = await this.agentService.runAgent(
          agentType,
          session.idea,
          (event) => {
            this.emit(chatId, {
              type: 'agent',
              chatId,
              runId: run.id,
              agentType: event.agentType,
              message: `[${event.agentType}] ${event.message}`,
              progress: this.computeAgentAwareProgress(
                completed,
                total,
                event.progress,
              ),
              status: 'running',
            });
          },
          {
            chatSessionId: chatId,
            agentRunId: run.id,
            agentType,
          },
        );
        const memorySummary = this.buildAgentSummary(agentType, result);
        const resultWithMemory = this.attachSummaryToResult(
          result,
          memorySummary,
        );
        await this.appendAgentSummaryToMemory(chatId, agentType, memorySummary);

        await this.prisma.agentRun.update({
          where: { id: run.id },
          data: {
            status: AgentRunStatus.completed,
            finishedAt: new Date(),
            resultJson: this.toJsonInput(resultWithMemory),
            reportPath: null,
            reportName: null,
            ...(session.isPublic
              ? {
                  isPublic: true,
                  publicShareToken:
                    run.publicShareToken ?? this.generateShareToken('rep'),
                }
              : {}),
          },
        });

        completed += 1;
        const progress = this.computeProgress(completed, total);
        await this.prisma.chatSession.update({
          where: { id: chatId },
          data: {
            progress,
            status:
              completed === total
                ? ChatSessionStatus.completed
                : ChatSessionStatus.running,
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
        const message =
          error instanceof Error ? error.message : 'Unknown agent error';

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
      isPublic: run.isPublic,
      publicShareToken: run.publicShareToken,
      publicSharePath:
        run.isPublic && run.publicShareToken
          ? this.buildReportSharePath(run.publicShareToken)
          : null,
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

  async getProjectShare(userId: string, chatId: string) {
    const session = await this.getSession(userId, chatId);
    const reports = await this.prisma.agentRun.findMany({
      where: { chatSessionId: chatId, status: AgentRunStatus.completed },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        agentType: true,
        reportName: true,
        createdAt: true,
        isPublic: true,
        publicShareToken: true,
      },
    });

    return {
      chatId,
      title: session.title,
      isPublic: session.isPublic,
      publicShareToken: session.publicShareToken,
      publicSharePath:
        session.isPublic && session.publicShareToken
          ? this.buildProjectSharePath(session.publicShareToken)
          : null,
      reports: reports.map((run) => ({
        runId: run.id,
        agentType: run.agentType,
        reportName: run.reportName,
        createdAt: run.createdAt,
        isPublic: run.isPublic,
        publicShareToken: run.publicShareToken,
        publicSharePath:
          run.isPublic && run.publicShareToken
            ? this.buildReportSharePath(run.publicShareToken)
            : null,
      })),
    };
  }

  async updateProjectShare(userId: string, chatId: string, isPublic: boolean) {
    const session = await this.getSession(userId, chatId);
    const nextToken =
      session.publicShareToken ?? this.generateShareToken('proj');

    const updated = await this.prisma.chatSession.update({
      where: { id: chatId },
      data: {
        isPublic,
        publicShareToken: nextToken,
      },
    });

    if (isPublic) {
      await this.promoteProjectReportsToPublic(chatId);
    }

    return {
      chatId,
      isPublic: updated.isPublic,
      publicShareToken: updated.publicShareToken,
      publicSharePath:
        updated.isPublic && updated.publicShareToken
          ? this.buildProjectSharePath(updated.publicShareToken)
          : null,
    };
  }

  async updateReportShare(
    userId: string,
    chatId: string,
    runId: string,
    isPublic: boolean,
  ) {
    await this.getSession(userId, chatId);

    const run = await this.prisma.agentRun.findUnique({ where: { id: runId } });
    if (!run || run.chatSessionId !== chatId) {
      throw new NotFoundException('Run not found');
    }

    const nextToken = run.publicShareToken ?? this.generateShareToken('rep');
    const updated = await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        isPublic,
        publicShareToken: nextToken,
      },
    });

    return {
      runId: updated.id,
      isPublic: updated.isPublic,
      publicShareToken: updated.publicShareToken,
      publicSharePath:
        updated.isPublic && updated.publicShareToken
          ? this.buildReportSharePath(updated.publicShareToken)
          : null,
    };
  }

  async getPublicProject(token: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: {
        publicShareToken: token,
        isPublic: true,
      },
      select: {
        id: true,
        title: true,
        idea: true,
        projectCategory: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Shared project not found');
    }

    const reports = await this.prisma.agentRun.findMany({
      where: {
        chatSessionId: session.id,
        status: AgentRunStatus.completed,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        agentType: true,
        reportName: true,
        createdAt: true,
        isPublic: true,
        publicShareToken: true,
      },
    });

    return {
      project: session,
      reports: reports.map((run) => ({
        runId: run.id,
        agentType: run.agentType,
        reportName: run.reportName,
        createdAt: run.createdAt,
        publicShareToken: run.publicShareToken,
        publicSharePath:
          run.isPublic && run.publicShareToken
            ? this.buildReportSharePath(run.publicShareToken)
            : null,
      })),
    };
  }

  async getPublicReport(token: string) {
    const run = await this.prisma.agentRun.findFirst({
      where: {
        publicShareToken: token,
        isPublic: true,
        status: AgentRunStatus.completed,
      },
      select: {
        id: true,
        agentType: true,
        reportName: true,
        createdAt: true,
        resultJson: true,
        chatSession: {
          select: {
            id: true,
            title: true,
            idea: true,
            projectCategory: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('Shared report not found');
    }

    return {
      project: run.chatSession,
      report: {
        runId: run.id,
        agentType: run.agentType,
        reportName: run.reportName,
        createdAt: run.createdAt,
        resultJson: run.resultJson,
      },
    };
  }

  async getUsage(userId: string, chatId: string) {
    await this.getSession(userId, chatId);

    const [aiCalls, tavilyUsages] = await this.prisma.$transaction([
      this.prisma.aiCallUsage.findMany({
        where: { chatSessionId: chatId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tavilyUsage.findMany({
        where: { chatSessionId: chatId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const aiTotals = aiCalls.reduce(
      (totals, call) => ({
        inputTokens: totals.inputTokens + (call.inputTokens ?? 0),
        outputTokens: totals.outputTokens + (call.outputTokens ?? 0),
        totalTokens: totals.totalTokens + (call.totalTokens ?? 0),
        calls: totals.calls + 1,
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 },
    );

    const tavilyTotals = tavilyUsages.reduce(
      (totals, usage) => ({
        creditsUsed: totals.creditsUsed + usage.creditsUsed,
        calls: totals.calls + 1,
      }),
      { creditsUsed: 0, calls: 0 },
    );

    return {
      chatId,
      totals: {
        ai: aiTotals,
        tavily: tavilyTotals,
      },
      aiCalls,
      tavilyUsages,
    };
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private generateShareToken(prefix: 'proj' | 'rep'): string {
    return `${prefix}_${randomBytes(20).toString('hex')}`;
  }

  private buildProjectSharePath(token: string): string {
    return `/share/project/${token}`;
  }

  private buildReportSharePath(token: string): string {
    return `/share/report/${token}`;
  }

  private async promoteProjectReportsToPublic(chatId: string) {
    const runs = await this.prisma.agentRun.findMany({
      where: { chatSessionId: chatId, status: AgentRunStatus.completed },
      select: { id: true, publicShareToken: true },
    });

    await Promise.all(
      runs.map((run) =>
        this.prisma.agentRun.update({
          where: { id: run.id },
          data: {
            isPublic: true,
            publicShareToken:
              run.publicShareToken ?? this.generateShareToken('rep'),
          },
        }),
      ),
    );
  }

  private computeProgress(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, Math.max(10, Math.round((completed / total) * 100)));
  }

  private computeAgentAwareProgress(
    completed: number,
    total: number,
    agentProgress: number,
  ): number {
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

  private buildInitialDirectionMemory(
    rawIdea: string,
    response: DirectionAiResponse,
  ): DirectionAiMemory {
    const now = new Date().toISOString();
    const clarificationNeeded = Boolean(response.clarificationNeeded);
    return {
      rawIdea,
      clarificationNeeded,
      project: {
        name: this.normalizeProjectName(response.projectName),
        category: response.projectCategory,
        description: this.normalizeProjectDescription(
          response.projectDescription,
        ),
        businessType: response.businessType,
        audience: response.audience,
        objective: response.objective,
        recommendedFirstAgent: response.recommendedFirstAgent,
        recommendationReason: response.recommendationReason,
        confidence: response.confidence,
      },
      conversation: [
        this.createConversationItem('user', 'intake', rawIdea, now),
        this.createConversationItem(
          'assistant',
          clarificationNeeded ? 'clarification' : 'recommendation',
          response.assistantMessage,
          now,
        ),
      ],
      pendingQuestions: clarificationNeeded
        ? (response.clarificationQuestions ?? [])
        : [],
      agentSummaries: {},
      lastUpdatedAt: now,
    };
  }

  private readDirectionMemory(
    memoryJson: Prisma.JsonValue | null | undefined,
  ): DirectionAiMemory {
    if (
      !memoryJson ||
      typeof memoryJson !== 'object' ||
      Array.isArray(memoryJson)
    ) {
      return {
        project: {
          name: 'Untitled Project',
          category: 'other',
          description: 'DirectionAI is refining the project brief.',
        },
        conversation: [],
        pendingQuestions: [],
        agentSummaries: {},
        clarificationNeeded: false,
        lastUpdatedAt: new Date().toISOString(),
      };
    }

    const raw = memoryJson as Record<string, unknown>;
    const projectRaw = this.asRecord(raw.project);
    const conversationRaw = Array.isArray(raw.conversation)
      ? raw.conversation
      : [];
    const pendingRaw = Array.isArray(raw.pendingQuestions)
      ? raw.pendingQuestions
      : [];
    const summariesRaw = this.asRecord(raw.agentSummaries);

    return {
      rawIdea: this.asString(raw.rawIdea),
      project: {
        name: this.asString(projectRaw?.name) || 'Untitled Project',
        category: this.asString(projectRaw?.category) || 'other',
        description:
          this.asString(projectRaw?.description) ||
          'DirectionAI is refining the project brief.',
        businessType: this.asString(projectRaw?.businessType),
        audience: this.asString(projectRaw?.audience),
        objective: this.asString(projectRaw?.objective),
        recommendedFirstAgent: this.asString(projectRaw?.recommendedFirstAgent),
        recommendationReason: this.asString(projectRaw?.recommendationReason),
        confidence: this.asNumber(projectRaw?.confidence),
      },
      conversation: conversationRaw
        .map((entry) => this.asConversationItem(entry))
        .filter((entry): entry is DirectionAiConversationItem =>
          Boolean(entry),
        ),
      pendingQuestions: pendingRaw
        .map((item) => this.asString(item))
        .filter((item): item is string => Boolean(item)),
      agentSummaries: Object.entries(summariesRaw ?? {}).reduce<
        Record<string, string>
      >((acc, [key, value]) => {
        const summary = this.asString(value);
        if (summary) acc[key] = summary;
        return acc;
      }, {}),
      clarificationNeeded: Boolean(raw.clarificationNeeded),
      lastUpdatedAt:
        this.asString(raw.lastUpdatedAt) || new Date().toISOString(),
    };
  }

  private applyDirectionResponse(
    current: DirectionAiMemory,
    userMessage: string,
    response: DirectionAiResponse,
  ): DirectionAiMemory {
    const now = new Date().toISOString();
    const clarificationNeeded = Boolean(response.clarificationNeeded);
    const conversation = [
      ...current.conversation,
      this.createConversationItem('user', 'reply', userMessage, now),
      this.createConversationItem(
        'assistant',
        response.clarificationNeeded ? 'clarification' : 'recommendation',
        response.assistantMessage,
        now,
      ),
    ];

    return {
      rawIdea: current.rawIdea,
      clarificationNeeded,
      project: {
        name: this.normalizeProjectName(
          response.projectName || current.project.name,
        ),
        category: response.projectCategory || current.project.category,
        description: this.normalizeProjectDescription(
          response.projectDescription || current.project.description,
        ),
        businessType: response.businessType || current.project.businessType,
        audience: response.audience || current.project.audience,
        objective: response.objective || current.project.objective,
        recommendedFirstAgent:
          response.recommendedFirstAgent ||
          current.project.recommendedFirstAgent,
        recommendationReason:
          response.recommendationReason || current.project.recommendationReason,
        confidence: response.confidence ?? current.project.confidence,
      },
      conversation,
      pendingQuestions: clarificationNeeded
        ? (response.clarificationQuestions ?? [])
        : [],
      agentSummaries: current.agentSummaries,
      lastUpdatedAt: now,
    };
  }

  private async appendAgentSummaryToMemory(
    chatId: string,
    agentType: string,
    summary: string,
  ) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: chatId },
      select: { memoryJson: true },
    });

    const memory = this.readDirectionMemory(session?.memoryJson);
    const now = new Date().toISOString();
    const normalizedAgentType = agentType.trim().toUpperCase();
    const nextMemory: DirectionAiMemory = {
      ...memory,
      conversation: [
        ...memory.conversation,
        this.createConversationItem('assistant', 'summary', summary, now),
      ],
      agentSummaries: {
        ...memory.agentSummaries,
        [normalizedAgentType]: summary,
      },
      lastUpdatedAt: now,
    };

    await this.prisma.chatSession.update({
      where: { id: chatId },
      data: {
        memoryJson: this.toJsonInput(nextMemory),
      },
    });
  }

  private createConversationItem(
    role: 'user' | 'assistant',
    kind: DirectionAiConversationItem['kind'],
    content: string,
    createdAt = new Date().toISOString(),
  ): DirectionAiConversationItem {
    return {
      role,
      kind,
      content,
      createdAt,
    };
  }

  private asConversationItem(
    value: unknown,
  ): DirectionAiConversationItem | null {
    const record = this.asRecord(value);
    if (!record) return null;
    const role = this.asString(record.role) as 'user' | 'assistant' | undefined;
    const kind = this.asString(record.kind) as
      | DirectionAiConversationItem['kind']
      | undefined;
    const content = this.asString(record.content);
    if (!role || !kind || !content) return null;
    return {
      role,
      kind,
      content,
      createdAt: this.asString(record.createdAt) || new Date().toISOString(),
    };
  }

  private normalizeProjectName(name?: string) {
    const normalized = name?.trim() || 'Untitled Project';
    return normalized.slice(0, 80);
  }

  private normalizeProjectDescription(description?: string) {
    const normalized =
      description?.trim() ||
      'DirectionAI is refining the project brief into a clear business plan and execution path.';
    return normalized;
  }

  private async assertUserCanCreateProject(userId: string) {
    const [user, projectCount] = await this.prisma.$transaction([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.chatSession.count({ where: { userId } }),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (projectCount < 1) return;

    if (user.projectCredits <= 0) {
      throw new ForbiddenException(
        'Free plan includes only 1 project. Buy a paid project pack to create the next project.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        projectCredits: {
          decrement: 1,
        },
      },
    });
  }

  private attachSummaryToResult(
    result: unknown,
    summary: string,
  ): Record<string, unknown> {
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
    const root =
      result && typeof result === 'object'
        ? (result as Record<string, unknown>)
        : null;
    const lines: string[] = [];
    lines.push(`### ${agentType} Summary`);

    if (agentType === 'RESEARCH') {
      const merged = this.parseResearchMergedResponse(root?.mergedResponse);
      const mergedShortSummary = this.asString(root?.mergedShortSummary);
      if (mergedShortSummary) {
        lines.push(`- Executive summary: ${this.compactText(mergedShortSummary, 260)}`);
      }
      const keyFindings = this.extractResearchKeyFindings(merged).slice(0, 4);
      if (keyFindings.length) {
        lines.push(`- Key findings: ${keyFindings.join(' | ')}`);
      } else {
        lines.push(
          '- Key findings: Research report generated. Open report for detailed section breakdown.',
        );
      }
      return lines.join('\n');
    }

    if (agentType === 'DEVELOPMENT') {
      const structure = this.asRecord(root?.response_structure);
      const finalSummary = this.asRecord(structure?.final_development_summary);
      const execSummary = this.asString(finalSummary?.execution_summary);
      const timeline = this.asString(finalSummary?.estimated_timeline);
      const buildOrder = this.asStringArray(finalSummary?.build_order).slice(
        0,
        4,
      );
      if (execSummary) lines.push(`- Execution summary: ${execSummary}`);
      if (timeline) lines.push(`- Estimated timeline: ${timeline}`);
      if (buildOrder.length)
        lines.push(`- Build order: ${buildOrder.join(' -> ')}`);
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
      const primaryAudience = this.asStringArray(
        audience?.primary_audience,
      ).slice(0, 3);
      const channel = this.asString(
        finalSummary?.recommended_acquisition_channel,
      );
      const strategy = this.asString(
        finalSummary?.recommended_primary_strategy,
      );
      const recommendation = this.asString(
        finalSummary?.final_strategic_recommendation,
      );
      const quickWins = this.asStringArray(execution?.quick_wins).slice(0, 3);
      const priorities = this.asStringArray(
        platform?.platform_priority_order,
      ).slice(0, 4);

      if (businessSummary)
        lines.push(`- Business snapshot: ${businessSummary}`);
      if (uvp) lines.push(`- Value proposition: ${uvp}`);
      if (primaryAudience.length)
        lines.push(`- Core audience: ${primaryAudience.join(', ')}`);
      if (channel) lines.push(`- Recommended acquisition channel: ${channel}`);
      if (strategy) lines.push(`- Primary growth strategy: ${strategy}`);
      if (priorities.length)
        lines.push(`- Platform priority: ${priorities.join(' -> ')}`);
      if (quickWins.length)
        lines.push(`- Quick wins: ${quickWins.join(' | ')}`);
      if (recommendation)
        lines.push(`- Strategic recommendation: ${recommendation}`);

      if (lines.length === 1) {
        lines.push(
          '- Marketing plan generated, but key fields were missing in the payload.',
        );
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
      if (keyPoints.length)
        lines.push(`- Key narrative points: ${keyPoints.join(' | ')}`);
      lines.push(`- Slides prepared: ${count}`);
      lines.push(
        '- Investor-ready slide content, visuals, and render map generated.',
      );
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

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is string =>
        typeof item === 'string' && Boolean(item.trim()),
    );
  }

  private parseResearchMergedResponse(
    value: unknown,
  ): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value !== 'string') return null;

    try {
      const parsed = JSON.parse(value) as unknown;
      return this.asRecord(parsed);
    } catch {
      return null;
    }
  }

  private extractResearchKeyFindings(
    merged: Record<string, unknown> | null,
  ): string[] {
    if (!merged) return [];

    const findings: string[] = [];
    const candidateSections = [
      this.asRecord(merged.marketResearchData)?.marketResearch,
      this.asRecord(merged.marketResearchData)?.competitorResearch,
      this.asRecord(merged.marketResearchData)?.trendResearch,
      this.asRecord(merged.marketSizingData)?.tam,
      this.asRecord(merged.customerInsightsData)?.painPoints,
      this.asRecord(merged.startupData)?.startupValidation,
      this.asRecord(merged.strategicAnalysisData)?.swot,
    ];

    for (const section of candidateSections) {
      const answer = this.extractSectionAnswer(section);
      if (answer) findings.push(answer);
      if (findings.length >= 4) break;
    }

    return findings;
  }

  private extractSectionAnswer(value: unknown): string | null {
    const section = this.asRecord(value);
    if (!section) return null;
    const data = section.data;
    if (!data) return null;

    if (Array.isArray(data)) {
      for (const item of data) {
        const answer = this.asString(this.asRecord(item)?.answer);
        if (answer) return this.compactText(answer, 180);
      }
      return null;
    }

    const answer = this.asString(this.asRecord(data)?.answer);
    return answer ? this.compactText(answer, 180) : null;
  }

  private compactText(value: string, maxLength: number): string {
    const oneLine = value.replace(/\s+/g, ' ').trim();
    if (oneLine.length <= maxLength) return oneLine;
    return `${oneLine.slice(0, maxLength - 3).trimEnd()}...`;
  }
}
