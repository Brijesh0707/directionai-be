import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { ResearchAgentService } from './Research/research';

class RunResearchTestDto {
  @IsString()
  @MinLength(1)
  text: string;
}

@Controller('agent/research-test')
export class ResearchTestController {
  constructor(private readonly researchAgentService: ResearchAgentService) {}

  @Post()
  runResearch(@Body() dto: RunResearchTestDto) {
    return this.researchAgentService.runResearchAgentPipeline(dto.text);
  }
}
