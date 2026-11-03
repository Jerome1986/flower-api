import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 门店商品请求参数及校验规则。
export class StoreProductQueryDto {
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

  // 门店编号。
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  storeId?: number

  // 去除空白后的搜索关键词。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string

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
