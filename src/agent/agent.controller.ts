import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { RunAgentDto } from './dto/run-agent.dto';
import { AgentService } from './agent.service';
import { MarketingAgent } from './Marketing/marketing.agent';
import { DevelopmentAgent } from './Development/development.agent';

class RunMarketingTestDto {
  @IsString()
  @MinLength(1)
  text: string;
}

@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly marketingAgent: MarketingAgent,
    private readonly developmentAgent: DevelopmentAgent,
  ) {}

  @Post()
  runAgent(@Body() dto: RunAgentDto) {
    return this.agentService.runAgent(dto.agentType, dto.text);
  }

  @Post('marketing-test/full')
  runMarketing(@Body() dto: RunMarketingTestDto) {
    return this.marketingAgent.runMarketingAgentPipeline(dto.text);
  }

    @Post('development-test/full')
  runDevelopment(@Body() dto: RunMarketingTestDto) {
    return this.developmentAgent.runDevelopmentAgentPipeline(dto.text);
  }
}
