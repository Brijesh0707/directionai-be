import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AiModule } from '../ai/ai.module';
import { PptAgentService } from './PPT/ppt.agent';
import { AgentController } from './agent.controller';
import { ResearchTestController } from './research-test.controller';
import { ResearchAgentService } from './Research/research';
import { MarketResearchService } from './Research/SearchAgent/market.research';
import { MarketingAgent } from './Marketing/marketing.agent';
import { DevelopmentAgent } from './Development/development.agent';

@Module({
  imports: [AiModule],
  controllers: [AgentController, ResearchTestController],
  providers: [
    AgentService,
    PptAgentService,
    ResearchAgentService,
    MarketResearchService,
    MarketingAgent,
    DevelopmentAgent,
  ],
  exports: [
    AgentService,
    PptAgentService,
    ResearchAgentService,
    MarketResearchService,
    MarketingAgent,
    DevelopmentAgent,
  ],
})
export class AgentModule {}
