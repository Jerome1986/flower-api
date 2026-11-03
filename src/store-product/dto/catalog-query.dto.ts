import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'
import { StoreProductQueryDto } from './store-product-query.dto'

// 门店商品请求参数及校验规则。
export class CatalogQueryDto extends StoreProductQueryDto {
  // 门店编号。
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  declare storeId: number
}
