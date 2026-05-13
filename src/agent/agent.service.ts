import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FinalPptPayload, PptAgentService } from './PPT/ppt.agent';
import { FinalResearchPayload, ResearchAgentService } from './Research/research';

export type AgentType = 'PPT' | 'RESEARCH';
export type AgentResult = FinalPptPayload | FinalResearchPayload;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly pptAgentService: PptAgentService,
    private readonly researchAgentService: ResearchAgentService,
  ) {}

  async runAgent(agentType: string, text: string): Promise<AgentResult> {
    const normalizedAgentType = agentType?.trim().toUpperCase();
    const normalizedText = text?.trim();

    if (!normalizedAgentType) {
      throw new BadRequestException('agentType is required');
    }

    if (!normalizedText) {
      throw new BadRequestException('text is required');
    }

    this.logger.log(`runAgent called for type=${normalizedAgentType}`);

    switch (normalizedAgentType) {
      case 'PPT':
        this.logger.log('Routing request to PptAgentService');
        return this.pptAgentService.runPptAgentPipeline(normalizedText);
      case 'RESEARCH':
        this.logger.log('Routing request to ResearchAgentService');
        return this.researchAgentService.runResearchAgentPipeline(normalizedText);
      default:
        throw new BadRequestException(
          `Unsupported agent type: ${agentType}. Supported types: PPT, RESEARCH`,
        );
    }
  }
}
