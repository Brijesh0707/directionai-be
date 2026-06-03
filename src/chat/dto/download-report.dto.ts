import { IsOptional, IsString } from 'class-validator';

export class DownloadReportDto {
  @IsString()
  html: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}
