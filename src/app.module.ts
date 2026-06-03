import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './upload/upload.module';
import { ChatModule } from './chat/chat.module';
import { PrismaModule } from './prisma/prisma.module';
import { AgentModule } from './agent/agent.module';
import { FeedbackModule } from './feedback/feedback.module';

@Module({
  imports: [PrismaModule, AiModule, AuthModule, UploadModule, ChatModule, AgentModule, FeedbackModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
