import { CouponType } from '@prisma/client'
import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 优惠券模板请求参数及校验规则。
export class CouponTemplateQueryDto {
  // 当前页码。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1

  // 每页记录数。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10

  // 去除空白后的搜索关键词。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string

  // 业务类型。
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType

  // 是否启用。
  @IsOptional()
  @Transform(
    ({
      value,
    }: {
      // 待转换或校验的值。
      value: unknown
    }) => (value === 'true' ? true : value === 'false' ? false : value),
  )
  @IsBoolean()
  enabled?: boolean
}
