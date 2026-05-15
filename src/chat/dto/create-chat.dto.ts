import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateChatDto {
  @IsString()
  @MinLength(3)
  idea: string;

  @IsOptional()
  @IsString()
  title?: string;
}
