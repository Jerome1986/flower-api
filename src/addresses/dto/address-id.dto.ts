import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'

// 收货地址请求参数及校验规则。
export class AddressIdDto {
  // 记录编号。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id!: number
}
