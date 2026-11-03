import { IsInt, Max, Min } from 'class-validator'
import { StoreProductSettingsDto } from './store-product-settings.dto'

// 门店商品请求参数及校验规则。
export class SelectStoreProductDto extends StoreProductSettingsDto {
  // 门店编号。
  @IsInt()
  @Min(1)
  @Max(2147483647)
  storeId: number

  // 商品编号。
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId: number
}
