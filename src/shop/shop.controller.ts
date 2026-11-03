import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { ShopService } from './shop.service'

// 商城商品接口入口。
@Controller('shop/stores')
export class ShopController {
  // 注入商城商品业务服务，统一处理接口请求。
  constructor(
    // 商城查询服务。
    private readonly shop: ShopService,
  ) {}

  // 查询当前可访问的门店。
  @Get()
  stores() {
    // 1. 返回本次处理结果。
    return this.shop.stores()
  }

  // 查询可用门店详情。
  @Get(':storeId')
  store(
    // 记录编号。
    @Param('storeId', ParseIntPipe) id: number,
  ) {
    // 1. 返回本次处理结果。
    return this.shop.store(id)
  }

  // 查询门店已上架的商品。
  @Get(':storeId/products')
  products(
    // 记录编号。
    @Param('storeId', ParseIntPipe) id: number,
  ) {
    // 1. 返回本次处理结果。
    return this.shop.products(id)
  }

  // 查询门店已上架的指定商品。
  @Get(':storeId/products/:productId')
  product(
    // 门店编号。
    @Param('storeId', ParseIntPipe) storeId: number,
    // 商品编号。
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    // 1. 返回本次处理结果。
    return this.shop.product(storeId, productId)
  }
}
