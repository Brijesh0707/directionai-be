import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FinalPptPayload, PptAgentService } from './PPT/ppt.agent';
import { FinalMarketingPayload, MarketingAgent } from './Marketing/marketing.agent';
import { FinalResearchPayload, ResearchAgentService } from './Research/research';

export type AgentType = 'PPT' | 'RESEARCH' | 'MARKETING';

export type AgentResult = FinalPptPayload | FinalResearchPayload | FinalMarketingPayload;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly pptAgentService: PptAgentService,
    private readonly researchAgentService: ResearchAgentService,
    private readonly marketingAgent: MarketingAgent,
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
      case 'MARKETING':
        this.logger.log('Routing request to MarketingAgent');
        return this.marketingAgent.runMarketingAgentPipeline(normalizedText);
      default:
        throw new BadRequestException(
          `Unsupported agent type: ${agentType}. Supported types: PPT, RESEARCH, MARKETING`,
        );
    }
  }
}
