import { Transform, Type } from 'class-transformer';
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
import { CouponType } from '@prisma/client';

export class CouponTemplateQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsEnum(CouponType) type?: CouponType;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  enabled?: boolean;
}

export class SaveCouponTemplateDto {
  @IsString() @MaxLength(100) name: string;
  @IsEnum(CouponType) type: CouponType;
  /** 接口金额采用整数分，后台表单以元展示和填写。 */
  @IsOptional() @IsInt() @Min(1) @Max(999999999999) cashAmount?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) exchangeSpecId?:
    number | null;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) exchangeQuantity?:
    number | null;
  @IsInt() @Min(1) @Max(87600) validityHours: number;
  @IsBoolean() enabled: boolean;
}

export class CouponTemplateStatusDto {
  @IsBoolean() enabled: boolean;
}
