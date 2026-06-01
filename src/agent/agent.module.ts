import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentService } from './agent.service';
import { AiModule } from '../ai/ai.module';
import { PptAgentService } from './PPT/ppt.agent';
import { ImageKitService } from './PPT/imagekit.service';
import { AgentController } from './agent.controller';
import { ResearchTestController } from './research-test.controller';
import { ResearchAgentService } from './Research/research';
import { MarketResearchService } from './Research/SearchAgent/market.research';
import { MarketingAgent } from './Marketing/marketing.agent';
import { DevelopmentAgent } from './Development/development.agent';
import { PrismaModule } from '../prisma/prisma.module';
import { DirectionAiAgentService } from './directionai.agent';

@Module({
  imports: [AiModule, PrismaModule, ConfigModule],
  controllers: [AgentController, ResearchTestController],
  providers: [
    AgentService,
    PptAgentService,
    ImageKitService,
    ResearchAgentService,
    MarketResearchService,
    MarketingAgent,
    DevelopmentAgent,
    DirectionAiAgentService,
  ],
  exports: [
    AgentService,
    PptAgentService,
    ImageKitService,
    ResearchAgentService,
    MarketResearchService,
    MarketingAgent,
    DevelopmentAgent,
    DirectionAiAgentService,
  ],
})
export class AgentModule {}
