import { IsBoolean } from 'class-validator'

// 营销活动请求参数及校验规则。
export class MarketingActivityStatusDto {
  // 是否启用。
  @IsBoolean()
  enabled: boolean
}
