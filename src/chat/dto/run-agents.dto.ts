import { IsArray, ArrayNotEmpty, IsString } from 'class-validator';

export class RunAgentsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  agentTypes: string[];
}
