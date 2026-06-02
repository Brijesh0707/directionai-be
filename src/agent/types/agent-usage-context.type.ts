import type { DirectionAiMemory } from './directionai-memory.type';

export type AgentUsageContext = {
  chatSessionId?: string;
  agentRunId?: string;
  agentType?: string;
  callLabel?: string;
  directionMemory?: DirectionAiMemory;
};

