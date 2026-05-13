import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OpenAiService } from './services/openai-ai.service';
import { BedrockAiService } from './services/bedrock-ai.service';
import { ClaudeAiService } from './services/claude-ai.service';
import { GrokAiService } from './services/grok-ai.service';
import { GeminiAiService } from './services/gemini-ai.service';
import { AiProviderResponse } from './types/ai-provider-response.type';

type ProviderKey = 'openai' | 'bedrock' | 'claude' | 'grok' | 'gemini';

type AiAttemptAudit = {
  provider: ProviderKey;
  requestedModelName?: string;
  providerModelName?: string;
  isPrimaryAttempt: boolean;
  isFallbackAttempt: boolean;
  status: 'success' | 'failed';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  errorMessage?: string;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiService: OpenAiService,
    private readonly bedrockAiService: BedrockAiService,
    private readonly claudeAiService: ClaudeAiService,
    private readonly grokAiService: GrokAiService,
    private readonly geminiAiService: GeminiAiService,
  ) {}

  private toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  async generateWithModel(
    prompt: string,
    modelName: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<{ text: string; modelName: string; provider: ProviderKey; auditId: string }> {
    const primaryProvider = this.resolveProviderFromModel(modelName);
    const fallbackOrder = this.getFallbackOrder(primaryProvider);

    const attempts: AiAttemptAudit[] = [];
    let lastError: unknown;

    for (const [index, provider] of fallbackOrder.entries()) {
      const startedAt = new Date();
      const isPrimaryAttempt = index === 0;
      const isFallbackAttempt = !isPrimaryAttempt;

      this.logger.debug(
        `[AI_ATTEMPT_START] provider=${provider} requestedModel=${modelName} isPrimary=${isPrimaryAttempt} isFallback=${isFallbackAttempt}`,
      );

      try {
        const modelOverride = provider === primaryProvider ? modelName : undefined;
        const response = await this.callProvider(provider, prompt, modelOverride, advancedParams);
        const endedAt = new Date();

        attempts.push({
          provider,
          requestedModelName: modelName,
          providerModelName: response.providerModelName,
          isPrimaryAttempt,
          isFallbackAttempt,
          status: 'success',
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          totalTokens: response.totalTokens,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          latencyMs: endedAt.getTime() - startedAt.getTime(),
        });

        this.logger.debug(
          `[AI_ATTEMPT_SUCCESS] provider=${provider} model=${response.providerModelName} fallback=${isFallbackAttempt} inputTokens=${response.inputTokens ?? 0} outputTokens=${response.outputTokens ?? 0}`,
        );

        const audit = await this.prisma.aiModelAudit.create({
          data: {
            prompt,
            requestedModelName: modelName,
            finalProvider: provider,
            finalModelName: response.providerModelName,
            status: 'success',
            usedFallback: isFallbackAttempt,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            totalTokens: response.totalTokens,
            advancedParams: this.toJsonInput(advancedParams),
            rawUsage: this.toJsonInput(response.rawUsage),
            attempts,
          },
        });

        return {
          text: response.text,
          modelName: response.providerModelName,
          provider,
          auditId: audit.id,
        };
      } catch (error) {
        const endedAt = new Date();
        const errorMessage = error instanceof Error ? error.message : 'Unknown AI provider error';
        attempts.push({
          provider,
          requestedModelName: modelName,
          isPrimaryAttempt,
          isFallbackAttempt,
          status: 'failed',
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          latencyMs: endedAt.getTime() - startedAt.getTime(),
          errorMessage,
        });

        this.logger.warn(
          `[AI_ATTEMPT_FAILED] provider=${provider} requestedModel=${modelName} fallback=${isFallbackAttempt} error=${errorMessage}`,
        );
        lastError = error;
      }
    }

    await this.prisma.aiModelAudit.create({
      data: {
        prompt,
        requestedModelName: modelName,
        finalProvider: primaryProvider,
        finalModelName: modelName,
        status: 'failed',
        usedFallback: true,
        advancedParams: this.toJsonInput(advancedParams),
        attempts,
      },
    });

    throw lastError ?? new Error('All AI providers failed to generate a response.');
  }

  async generateWithOpenAi(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    return this.openAiService.generateFromPrompt(prompt, modelName, advancedParams);
  }

  async generateWithBedrock(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    return this.bedrockAiService.generateFromPrompt(prompt, modelName, advancedParams);
  }

  async generateWithClaude(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    return this.claudeAiService.generateFromPrompt(prompt, modelName, advancedParams);
  }

  async generateWithGrok(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    return this.grokAiService.generateFromPrompt(prompt, modelName, advancedParams);
  }

  async generateWithGemini(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    return this.geminiAiService.generateFromPrompt(prompt, modelName, advancedParams);
  }

  private async callProvider(
    provider: ProviderKey,
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    switch (provider) {
      case 'openai':
        return this.generateWithOpenAi(prompt, modelName, advancedParams);
      case 'bedrock':
        return this.generateWithBedrock(prompt, modelName, advancedParams);
      case 'claude':
        return this.generateWithClaude(prompt, modelName, advancedParams);
      case 'grok':
        return this.generateWithGrok(prompt, modelName, advancedParams);
      case 'gemini':
        return this.generateWithGemini(prompt, modelName, advancedParams);
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  private resolveProviderFromModel(modelName: string): ProviderKey {
    const model = modelName.toLowerCase().trim();

    if (model.includes('bedrock') || model.startsWith('amazon.') || model.startsWith('anthropic.')) {
      return 'bedrock';
    }

    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
      return 'openai';
    }

    if (model.startsWith('claude')) {
      return 'claude';
    }

    if (model.startsWith('grok')) {
      return 'grok';
    }

    if (model.startsWith('gemini')) {
      return 'gemini';
    }

    return 'openai';
  }

  private getFallbackOrder(primaryProvider: ProviderKey): ProviderKey[] {
    const allProviders: ProviderKey[] = ['openai', 'claude', 'gemini', 'grok', 'bedrock'];
    return [primaryProvider, ...allProviders.filter((provider) => provider !== primaryProvider)];
  }
}
