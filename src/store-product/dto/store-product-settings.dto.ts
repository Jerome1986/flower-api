import { IsBoolean } from 'class-validator'

// 门店商品请求参数及校验规则。
export class StoreProductSettingsDto {
  // 是否启用。
  @IsBoolean()
  enabled: boolean

  // 是否支持到店自取。
  @IsBoolean()
  pickupEnabled: boolean

  // 是否支持配送。
  @IsBoolean()
  deliveryEnabled: boolean
}
