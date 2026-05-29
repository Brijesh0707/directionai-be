import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentModule } from '../agent/agent.module';
import { AuthModule } from '../auth/auth.module';
import { PublicShareController } from './public-share.controller';

@Module({
  imports: [PrismaModule, AgentModule, AuthModule],
  controllers: [ChatController, PublicShareController],
  providers: [ChatService],
})
export class ChatModule {}
