import { IsString, MinLength } from 'class-validator';

export class RunAgentDto {
  @IsString()
  @MinLength(1)
  agentType: string;

  @IsString()
  @MinLength(1)
  text: string;
}
