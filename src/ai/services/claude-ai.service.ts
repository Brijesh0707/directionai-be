import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AiProviderResponse } from '../types/ai-provider-response.type';

@Injectable()
export class ClaudeAiService {
  async generateFromPrompt(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = modelName ?? process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-0';

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      ...(advancedParams ?? {}),
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    return {
      text,
      providerModelName: response.model ?? model,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      rawUsage: response.usage ? (response.usage as unknown as Record<string, unknown>) : undefined,
    };
  }
}
