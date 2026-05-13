import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AiModule } from '../ai/ai.module';
import { PptAgentService } from './PPT/ppt.agent';

@Module({
  imports: [AiModule],
  providers: [AgentService, PptAgentService],
  exports: [PptAgentService],
})
export class AgentModule {}
