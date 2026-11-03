import { Transform, Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 客户用户请求参数及校验规则。
export class CustomerUserQueryDto {
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
  @MaxLength(128)
  keyword?: string

  // 当前业务状态。
  @IsOptional()
  @Transform(
    ({
      value,
    }: {
      // 待转换或校验的值。
      value: unknown
    }) => (value === 'ACTIVE' || value === 'INACTIVE' ? value : value),
  )
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE'
}
