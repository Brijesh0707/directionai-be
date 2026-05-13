import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AiProviderResponse } from '../types/ai-provider-response.type';

@Injectable()
export class OpenAiService {
  async generateFromPrompt(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = modelName ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

    const response = await client.responses.create({
      model,
      input: prompt,
      ...(advancedParams ?? {}),
    });

    const usage = response.usage;

    return {
      text: response.output_text ?? '',
      providerModelName: response.model ?? model,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      totalTokens: usage?.total_tokens,
      rawUsage: usage ? (usage as unknown as Record<string, unknown>) : undefined,
    };
  }
}
