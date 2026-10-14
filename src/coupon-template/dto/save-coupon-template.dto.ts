import { CouponType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SaveCouponTemplateDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(CouponType)
  type: CouponType;

  /** 接口金额采用整数分，后台表单以元展示和填写。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999999999999)
  cashAmount?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  exchangeSpecId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  exchangeQuantity?: number | null;

  @IsInt()
  @Min(1)
  @Max(87600)
  validityHours: number;

  @IsBoolean()
  enabled: boolean;
}
