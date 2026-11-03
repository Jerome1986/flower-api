import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 商品请求参数及校验规则。
export class ProductQueryDto {
  // 业务类型。
  @IsOptional()
  @IsIn(['ORDINARY', 'CUSTOM'])
  type?: 'ORDINARY' | 'CUSTOM'

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

  // 商品分类编号。
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number

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
