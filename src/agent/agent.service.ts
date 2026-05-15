import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FinalPptPayload, PptAgentService } from './PPT/ppt.agent';
import { FinalMarketingPayload, MarketingAgent } from './Marketing/marketing.agent';
import { FinalResearchPayload, ResearchAgentService } from './Research/research';
import { DevelopmentAgent, FinalDevelopmentPayload } from './Development/development.agent';

export type AgentType = 'PPT' | 'RESEARCH' | 'MARKETING' | 'DEVELOPMENT';

export type AgentResult =
  | FinalPptPayload
  | FinalResearchPayload
  | FinalMarketingPayload
  | FinalDevelopmentPayload;

export type AgentProgressEvent = {
  agentType: AgentType;
  stage: string;
  message: string;
  progress: number;
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly pptAgentService: PptAgentService,
    private readonly researchAgentService: ResearchAgentService,
    private readonly marketingAgent: MarketingAgent,
    private readonly developmentAgent: DevelopmentAgent,
  ) {}

  async runAgent(
    agentType: string,
    text: string,
    onProgress?: (event: AgentProgressEvent) => void,
  ): Promise<AgentResult> {
    const normalizedAgentType = agentType?.trim().toUpperCase();
    const normalizedText = text?.trim();

    if (!normalizedAgentType) {
      throw new BadRequestException('agentType is required');
    }

    if (!normalizedText) {
      throw new BadRequestException('text is required');
    }

    this.logger.log(`runAgent called for type=${normalizedAgentType}`);
    const emit = (stage: string, message: string, progress: number) => {
      onProgress?.({
        agentType: normalizedAgentType as AgentType,
        stage,
        message,
        progress,
      });
    };

    switch (normalizedAgentType) {
      case 'PPT':
        this.logger.log('Routing request to PptAgentService');
        return this.pptAgentService.runPptAgentPipeline(normalizedText, undefined, emit);
      case 'RESEARCH':
        this.logger.log('Routing request to ResearchAgentService');
        return this.researchAgentService.runResearchAgentPipeline(normalizedText, emit);
      case 'MARKETING':
        this.logger.log('Routing request to MarketingAgent');
        return this.marketingAgent.runMarketingAgentPipeline(normalizedText, emit);
      case 'DEVELOPMENT':
        this.logger.log('Routing request to DevelopmentAgent');
        return this.developmentAgent.runDevelopmentAgentPipeline(normalizedText, emit);
      default:
        throw new BadRequestException(
          `Unsupported agent type: ${agentType}. Supported types: PPT, RESEARCH, MARKETING, DEVELOPMENT`,
        );
    }
  }
}
