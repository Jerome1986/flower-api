import { adminRole } from '@prisma/client'
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

// 管理员账号请求参数及校验规则。
export class AdminAccountQueryDto {
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
  @MaxLength(64)
  keyword?: string

  // 账号角色。
  @IsOptional()
  @IsEnum(adminRole)
  role?: adminRole

  // 当前业务状态。
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
  status?: boolean
}
