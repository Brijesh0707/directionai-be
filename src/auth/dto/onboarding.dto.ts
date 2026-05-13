import { IsOptional, IsString } from 'class-validator';

export class OnboardingDto {
  @IsOptional()
  @IsString()
  userType?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsString()
  stage?: string;
}
