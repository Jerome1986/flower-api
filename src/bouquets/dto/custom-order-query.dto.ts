import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

export class CustomOrderQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @IsOptional()
  @IsIn([
    'PENDING_DISPATCH',
    'DISPATCHED',
    'DELIVERING',
    'COMPLETED',
    'CANCELLED',
    'CLOSED',
  ])
  status?:
    | 'PENDING_DISPATCH'
    | 'DISPATCHED'
    | 'DELIVERING'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'CLOSED'
}
