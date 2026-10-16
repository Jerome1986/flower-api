import { IsBoolean } from 'class-validator'

export class CouponTemplateStatusDto {
  @IsBoolean()
  enabled: boolean
}
