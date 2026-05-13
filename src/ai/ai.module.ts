import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { OpenAiService } from './services/openai-ai.service';
import { BedrockAiService } from './services/bedrock-ai.service';
import { ClaudeAiService } from './services/claude-ai.service';
import { GrokAiService } from './services/grok-ai.service';
import { GeminiAiService } from './services/gemini-ai.service';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    OpenAiService,
    BedrockAiService,
    ClaudeAiService,
    GrokAiService,
    GeminiAiService,
  ],
  exports: [AiService, OpenAiService, BedrockAiService, ClaudeAiService, GrokAiService, GeminiAiService],
})
export class AiModule {}
