export type AiProviderResponse = {
  text: string;
  providerModelName: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  rawUsage?: Record<string, unknown>;
};
