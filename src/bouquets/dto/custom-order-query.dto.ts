import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

// 定制花束数据与处理逻辑。
export class CustomOrderQuery {
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
  pageSize = 20

  // 当前业务状态。
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
