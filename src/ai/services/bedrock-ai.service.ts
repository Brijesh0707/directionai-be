import { Injectable } from '@nestjs/common';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { AiProviderResponse } from '../types/ai-provider-response.type';

@Injectable()
export class BedrockAiService {
  async generateFromPrompt(
    prompt: string,
    modelName?: string,
    advancedParams?: Record<string, unknown>,
  ): Promise<AiProviderResponse> {
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });

    const model = modelName ?? process.env.BEDROCK_MODEL_ID ?? 'deepseek.v3-v1:0';
    const command = new ConverseCommand({
      modelId: model,
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      ...(advancedParams ?? {}),
    });

    const response = await client.send(command);
    const text = response.output?.message?.content?.find((item) => 'text' in item)?.text ?? '';
    const usage = response.usage;

    return {
      text,
      providerModelName: model,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
      rawUsage: usage ? (usage as unknown as Record<string, unknown>) : undefined,
    };
  }
}
