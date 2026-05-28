import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import type { AgentUsageContext } from './types/agent-usage-context.type';
import type { DirectionAiMemory, DirectionAiResponse } from './types/directionai-memory.type';

@Injectable()
export class DirectionAiAgentService {
  private readonly logger = new Logger(DirectionAiAgentService.name);

  constructor(private readonly aiService: AiService) {}

  async analyze(
    input: string,
    memory?: DirectionAiMemory | null,
    usageContext?: AgentUsageContext,
  ): Promise<DirectionAiResponse> {
    const prompt = this.buildPrompt(input, memory);
    const model =
      process.env.DIRECTIONAI_AGENT_MODEL ??
      process.env.BEDROCK_MODEL_ID ??
      'deepseek.v3-v1:0';

    try {
      const response = await this.aiService.generateWithBedrock(
        prompt,
        model,
        {
          inferenceConfig: {
            temperature: 0.2,
            maxTokens: 3000,
          },
        },
        {
          ...usageContext,
          agentType: usageContext?.agentType ?? 'DIRECTIONAI',
          callLabel: usageContext?.callLabel ?? 'directionai.main',
        },
      );

      return this.parseResponse(response.text);
    } catch (error) {
      this.logger.warn(
        `DirectionAI parse/generation fallback: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        projectName: 'Untitled Project',
        projectCategory: 'other',
        projectDescription:
          'DirectionAI is refining the project brief into a business-ready plan.',
        businessType: 'software',
        audience: 'Founders and early users',
        objective: 'Validate the idea and choose the right first execution path',
        confidence: 45,
        clarificationNeeded: true,
        clarificationQuestions: [
          'Who is the primary customer?',
          'What outcome should this project deliver?',
        ],
        recommendedFirstAgent: 'RESEARCH',
        recommendationReason:
          'Research is the safest first step until the problem and audience are fully defined.',
        assistantMessage:
          'I need a bit more detail before I lock the strategy, but I can already outline the direction.',
        memorySummary:
          'DirectionAI extracted a provisional project brief and requested a small amount of clarification.',
        suggestedNextSteps: ['Answer the clarification questions', 'Run the recommended agent next'],
      };
    }
  }

  private buildPrompt(input: string, memory?: DirectionAiMemory | null): string {
    const memoryText = memory
      ? JSON.stringify(memory, null, 2)
      : 'No prior memory exists for this project.';

    return `You are DirectionAI, the main business validator, project interpreter, and startup strategist.
Your job is to speak directly to the user, refine their raw idea into a proper project plan, decide the best first agent from the execution agents, and ask concise clarifying questions when needed.

Execution agents available:
- RESEARCH: market sizing, competitor analysis, validation, customer pain points
- PPT: pitch deck, executive narrative, investor presentation
- MARKETING: go-to-market, positioning, growth, channels, funnel
- DEVELOPMENT: roadmap, scope, tech stack, delivery planning

Rules:
1. Return ONLY valid JSON.
2. Keep project naming professional and business-ready.
3. If the idea is ambiguous, ask up to 3 short clarifying questions.
4. Still recommend the best first agent even when clarification is needed.
5. The assistantMessage must feel like a concise chat response.
6. The projectDescription should be a refined product/project description, not the raw user input.
7. The projectCategory should be normalized to one of: software, saas, d2c, marketplace, service, ai, mobile_app, fintech, healthtech, edtech, content, hardware, other.
8. Keep the memorySummary compact and useful for later agent runs.

Current memory:
${memoryText}

Latest user input:
${input}

Return this exact JSON shape:
{
  "projectName": "string",
  "projectCategory": "string",
  "projectDescription": "string",
  "businessType": "string",
  "audience": "string",
  "objective": "string",
  "confidence": 0,
  "clarificationNeeded": false,
  "clarificationQuestions": ["string"],
  "recommendedFirstAgent": "RESEARCH|PPT|MARKETING|DEVELOPMENT",
  "recommendationReason": "string",
  "assistantMessage": "string",
  "memorySummary": "string",
  "suggestedNextSteps": ["string"]
}`;
  }

  private parseResponse(raw: string): DirectionAiResponse {
    const cleaned = this.cleanJson(raw);
    const parsed = JSON.parse(cleaned) as DirectionAiResponse;

    const fallback: DirectionAiResponse = {
      projectName: 'Untitled Project',
      projectCategory: 'software',
      projectDescription: 'A business idea that DirectionAI is helping shape into an actionable project.',
      businessType: 'software',
      audience: 'Founders and early users',
      objective: 'Validate and structure the idea',
      confidence: 60,
      clarificationNeeded: true,
      clarificationQuestions: ['Who is the primary customer?', 'What outcome should the product create?'],
      recommendedFirstAgent: 'RESEARCH',
      recommendationReason: 'Research is the safest first step when the idea still needs validation.',
      assistantMessage:
        'I have a workable direction, but I need a little more detail before I lock the strategy.',
      memorySummary:
        'DirectionAI interpreted the idea, normalized the project into a business-ready brief, and flagged the next best execution path.',
      suggestedNextSteps: ['Answer the clarification questions', 'Run the recommended agent next'],
    };

    return {
      ...fallback,
      ...parsed,
      clarificationQuestions: Array.isArray(parsed.clarificationQuestions)
        ? parsed.clarificationQuestions.filter(Boolean)
        : fallback.clarificationQuestions,
      suggestedNextSteps: Array.isArray(parsed.suggestedNextSteps)
        ? parsed.suggestedNextSteps.filter(Boolean)
        : fallback.suggestedNextSteps,
    };
  }

  private cleanJson(raw: string): string {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? match[0] : cleaned;
  }
}
