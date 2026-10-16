import { IsBoolean } from 'class-validator'

export class StoreProductSettingsDto {
  @IsBoolean()
  enabled: boolean

  @IsBoolean()
  pickupEnabled: boolean

  @IsBoolean()
  deliveryEnabled: boolean
}
