import { BadRequestException, Injectable } from '@nestjs/common';
import { FinalPptPayload, PptAgentService } from './PPT/ppt.agent';

export type AgentType = 'PPT';
export type AgentResult = FinalPptPayload;

@Injectable()
export class AgentService {
  constructor(private readonly pptAgentService: PptAgentService) {}

  async runAgent(agentType: string, text: string): Promise<AgentResult> {
    const normalizedAgentType = agentType?.trim().toUpperCase();
    const normalizedText = text?.trim();

    if (!normalizedAgentType) {
      throw new BadRequestException('agentType is required');
    }

    if (!normalizedText) {
      throw new BadRequestException('text is required');
    }

    switch (normalizedAgentType) {
      case 'PPT':
        return this.pptAgentService.runPptAgentPipeline(normalizedText);
      default:
        throw new BadRequestException(
          `Unsupported agent type: ${agentType}. Supported types: PPT`,
        );
    }
  }
}
