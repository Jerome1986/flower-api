import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'

// 门店商品请求参数及校验规则。
export class AdjustStockDto {
  // 可售库存数量。
  @IsInt()
  @Min(0)
  @Max(2147483647)
  available: number

  // 并发更新版本号。
  @IsInt()
  @Min(0)
  @Max(2147483647)
  version: number

  // 业务操作原因。
  @IsString()
  @MaxLength(500)
  reason: string

  // 业务操作幂等键。
  @IsUUID()
  operationKey: string
}
