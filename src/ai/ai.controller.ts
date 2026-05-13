import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { GenerateAiDto } from './dto/generate-ai.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate')
  generate(@Body() payload: GenerateAiDto) {
    return this.aiService.generateWithModel(payload.prompt, payload.modelName, payload.advancedParams);
  }
}
