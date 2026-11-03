import { OrderStatus } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 订单数据与处理逻辑。
export class OrderQuery {
  // 当前页码。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  // 每页记录数。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  // 门店编号。
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  storeId?: number

  // 当前业务状态。
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus

  // 订单状态筛选分组。
  @IsOptional()
  @IsIn([
    'all',
    'unpaid',
    'pending',
    'preparing',
    'ready',
    'delivering',
    'completed',
    'cancelled',
  ])
  statusGroup?: string

  // 去除空白后的搜索关键词。
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string
}
