import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class GenerateAiDto {
  @IsString()
  @MinLength(1)
  prompt: string;

  @IsString()
  @MinLength(1)
  modelName: string;

  @IsOptional()
  @IsObject()
  advancedParams?: Record<string, unknown>;
}
