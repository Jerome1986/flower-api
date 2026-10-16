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

export class OrderQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  storeId?: number

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus

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

  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string
}
