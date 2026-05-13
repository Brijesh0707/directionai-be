import { Injectable } from '@nestjs/common';
import { generateText } from 'ai';
import { createXai } from '@ai-sdk/xai';
import { AiProviderResponse } from '../types/ai-provider-response.type';

@Injectable()
export class GrokAiService {
  async generateFromPrompt(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    const xai = createXai({ apiKey: process.env.XAI_API_KEY });
    const model = modelName ?? process.env.GROK_MODEL ?? 'grok-3-mini';

    const result = await generateText({
      model: xai(model),
      prompt,
      ...(advancedParams ?? {}),
    });

    const usage = result.usage;

    return {
      text: result.text ?? '',
      providerModelName: model,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      rawUsage: usage ? (usage as unknown as Record<string, unknown>) : undefined,
    };
  }
}
