import { IsInt, Max, Min } from 'class-validator'
import { StoreProductSettingsDto } from './store-product-settings.dto'

export class SelectStoreProductDto extends StoreProductSettingsDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  storeId: number

  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId: number
}
