export type DirectionAiMessageRole = 'user' | 'assistant';

export type DirectionAiConversationItem = {
  role: DirectionAiMessageRole;
  kind: 'intake' | 'clarification' | 'recommendation' | 'reply' | 'summary';
  content: string;
  createdAt: string;
};

export type DirectionAiProjectProfile = {
  name: string;
  category: string;
  description: string;
  businessType?: string;
  audience?: string;
  objective?: string;
  recommendedFirstAgent?: string;
  recommendationReason?: string;
  confidence?: number;
};

export type DirectionAiMemory = {
  rawIdea?: string;
  clarificationNeeded?: boolean;
  project: DirectionAiProjectProfile;
  conversation: DirectionAiConversationItem[];
  pendingQuestions: string[];
  agentSummaries: Record<string, string>;
  lastUpdatedAt: string;
};

export type DirectionAiResponse = {
  projectName: string;
  projectCategory: string;
  projectDescription: string;
  businessType: string;
  audience: string;
  objective: string;
  confidence: number;
  clarificationNeeded: boolean;
  clarificationQuestions: string[];
  recommendedFirstAgent: string;
  recommendationReason: string;
  assistantMessage: string;
  memorySummary: string;
  suggestedNextSteps: string[];
};
