import { IsBoolean } from 'class-validator'

// 商品请求参数及校验规则。
export class ProductStatusDto {
  // 是否启用。
  @IsBoolean()
  enabled: boolean
}
