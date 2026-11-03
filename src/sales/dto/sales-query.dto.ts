import { Type } from 'class-transformer'
import { IsIn, IsInt, Max, Min } from 'class-validator'

// 销售统计请求参数及校验规则。
export class SalesQueryDto {
  // 门店编号。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  storeId!: number

  // 统计周期。
  @IsIn(['today', 'week', 'month'])
  period!: 'today' | 'week' | 'month'
}
