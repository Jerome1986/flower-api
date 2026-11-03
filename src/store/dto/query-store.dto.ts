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

// 将查询参数中的 true 和 false 字符串转换为布尔值。
const QueryBoolean = () =>
  Transform(
    ({
      value,
    }: {
      // 待转换或校验的值。
      value: unknown
    }) => (value === 'true' ? true : value === 'false' ? false : value),
  )

// 门店请求参数及校验规则。
export class QueryStoreDto {
  // 当前页码。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page: number = 1

  // 每页记录数。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 10

  /** 按编号、名称、地址或电话模糊搜索 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string

  // 是否启用。
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  enabled?: boolean

  // 门店是否营业。
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  isOpen?: boolean
}
