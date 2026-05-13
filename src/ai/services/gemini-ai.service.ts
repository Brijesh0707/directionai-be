import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { AiProviderResponse } from '../types/ai-provider-response.type';

@Injectable()
export class GeminiAiService {
  async generateFromPrompt(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = modelName ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

    const response = await client.models.generateContent({
      model,
      contents: prompt,
      ...(advancedParams ?? {}),
    });

    const usage = response.usageMetadata;

    return {
      text: response.text ?? '',
      providerModelName: model,
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      totalTokens: usage?.totalTokenCount,
      rawUsage: usage ? (usage as unknown as Record<string, unknown>) : undefined,
    };
  }
}
