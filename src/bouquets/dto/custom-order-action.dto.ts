import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CustomOrderAction {
  @IsIn(['dispatch', 'deliver', 'complete', 'cancel'])
  action!: 'dispatch' | 'deliver' | 'complete' | 'cancel';

  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  partnerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  partnerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
