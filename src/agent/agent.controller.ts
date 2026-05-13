import { Body, Controller, Post } from '@nestjs/common';
import { RunAgentDto } from './dto/run-agent.dto';
import { AgentService } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  runAgent(@Body() dto: RunAgentDto) {
    return this.agentService.runAgent(dto.agentType, dto.text);
  }
}
