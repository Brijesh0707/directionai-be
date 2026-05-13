import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AiModule } from '../ai/ai.module';
import { PptAgentService } from './PPT/ppt.agent';
import { PptTemplateService } from './PPT/Templates/ppt-template.service';
import { PptRenderService } from './PPT/Templates/ppt-render.service';
import { AgentController } from './agent.controller';

@Module({
  imports: [AiModule],
  controllers: [AgentController],
  providers: [AgentService, PptAgentService, PptTemplateService, PptRenderService],
  exports: [AgentService, PptAgentService, PptTemplateService, PptRenderService],
})
export class AgentModule {}
