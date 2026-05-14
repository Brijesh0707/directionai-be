import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AiModule } from '../ai/ai.module';
import { PptAgentService } from './PPT/ppt.agent';
import { PptTemplateService } from './PPT/Templates/ppt-template.service';
import { PptRenderService } from './PPT/Templates/ppt-render.service';
import { AgentController } from './agent.controller';
import { ResearchTestController } from './research-test.controller';
import { ResearchAgentService } from './Research/research';
import { MarketResearchService } from './Research/SearchAgent/market.research';
import { MarketingAgent } from './Marketing/marketing.agent';


@Module({
  imports: [AiModule],
  controllers: [AgentController, ResearchTestController],
  providers: [
    AgentService,
    PptAgentService,
    PptTemplateService,
    PptRenderService,
    ResearchAgentService,
    MarketResearchService,
    MarketingAgent,
  ],
  exports: [
    AgentService,
    PptAgentService,
    PptTemplateService,
    PptRenderService,
    ResearchAgentService,
    MarketResearchService,
    MarketingAgent,
  ],
})
export class AgentModule {}
