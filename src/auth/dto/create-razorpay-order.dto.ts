import { IsIn, IsString } from 'class-validator';

export class CreateRazorpayOrderDto {
  @IsString()
  @IsIn(['PROJECT_20', 'PROJECT_30'])
  planCode: 'PROJECT_20' | 'PROJECT_30';
}
