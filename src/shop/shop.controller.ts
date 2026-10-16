import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { ShopService } from './shop.service'

@Controller('shop/stores')
export class ShopController {
  // 注入商城商品业务服务，统一处理接口请求。
  constructor(private readonly shop: ShopService) {}

  // 查询当前可访问的门店。
  @Get()
  stores() {
    return this.shop.stores()
  }

  // 查询可用门店详情。
  @Get(':storeId')
  store(@Param('storeId', ParseIntPipe) id: number) {
    return this.shop.store(id)
  }

  // 查询门店已上架的商品。
  @Get(':storeId/products')
  products(@Param('storeId', ParseIntPipe) id: number) {
    return this.shop.products(id)
  }

  // 查询门店已上架的指定商品。
  @Get(':storeId/products/:productId')
  product(
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.shop.product(storeId, productId)
  }
}
