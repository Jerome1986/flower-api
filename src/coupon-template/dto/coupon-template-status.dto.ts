import { IsBoolean } from 'class-validator'

// 优惠券模板请求参数及校验规则。
export class CouponTemplateStatusDto {
  // 是否启用。
  @IsBoolean()
  enabled: boolean
}
