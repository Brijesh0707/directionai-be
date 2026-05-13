import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AiModule } from '../ai/ai.module';
import { PptAgentService } from './PPT/ppt.agent';
import { AgentController } from './agent.controller';

@Module({
  imports: [AiModule],
  controllers: [AgentController],
  providers: [AgentService, PptAgentService],
  exports: [AgentService, PptAgentService],
})
export class AgentModule {}
