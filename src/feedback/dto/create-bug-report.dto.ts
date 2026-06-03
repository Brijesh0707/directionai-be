import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateBugReportDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsString()
  @IsOptional()
  attachmentUrl?: string;
}
