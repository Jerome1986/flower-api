import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ShopRepository } from './shop.repository'

import { storeSelect } from './shop.repository'
export { include, storeSelect } from './shop.repository'

import { include } from './shop.repository'

// 商城商品业务服务。
@Injectable()
export class ShopService {
  // 注入商城商品数据访问层及业务依赖。
  constructor(
    // 业务数据访问层。
    private readonly repo: ShopRepository,
  ) {}

  // 转换门店配送费，接口金额使用整数分。
  private serializeStore(
    // 门店信息。
    store: Prisma.StoreGetPayload<{
      // 查询返回的字段范围。
      select: typeof storeSelect
    }>,
  ) {
    // 1. 返回本次处理结果。
    return {
      ...store,
      deliveryFee: Math.round(Number(store.deliveryFee) * 100),
    }
  }

  // 查询当前可访问的门店。
  async stores() {
    // 1. 查询可访问门店列表。
    const stores = await this.repo.findStores()
    // 2. 返回本次处理结果。
    return stores.map((store) => this.serializeStore(store))
  }

  // 查询可用门店详情。
  async store(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 查询门店信息。
    const store = await this.repo.findStoreById(id)
    // 2. 不满足要求时提示：门店不存在或已停用。
    if (!store) throw new NotFoundException('门店不存在或已停用')
    // 3. 转换门店配送费，接口金额使用整数分。
    return this.serializeStore(store)
  }

  // 整理商城商品响应字段。
  private serialize(
    // 当前业务明细。
    item: Prisma.StoreProductGetPayload<{
      // 关联查询配置。
      include: typeof include
    }>,
  ) {
    // 1. 准备商品信息。
    const product = item.product
    // 2. 返回本次处理结果。
    return {
      id: product.id,
      storeProductId: item.id,
      storeId: item.storeId,
      name: product.name,
      coverImage: product.coverImage,
      images: Array.isArray(product.images)
        ? product.images.filter(
            (image): image is string => typeof image === 'string',
          )
        : [],
      description: product.description ?? '',
      category: product.category?.enabled
        ? { id: product.category.id, name: product.category.name }
        : null,
      pickupEnabled: item.pickupEnabled,
      deliveryEnabled: item.deliveryEnabled,
      specs: product.specs.map((spec) => ({
        id: spec.id,
        name: spec.name,
        unit: spec.unit,
        price: Math.round(Number(spec.price) * 100),
        available:
          item.stocks.find((stock) => stock.specId === spec.id)?.available ?? 0,
      })),
    }
  }

  // 查询门店已上架的商品。
  async products(
    // 门店编号。
    storeId: number,
  ) {
    // 1. 查询可用门店详情。
    await this.store(storeId)
    // 2. 查询业务明细列表。
    const items = await this.repo.findProducts(storeId)
    // 3. 返回本次处理结果。
    return items.map((item) => this.serialize(item))
  }

  // 查询门店已上架的指定商品。
  async product(
    // 门店编号。
    storeId: number,
    // 商品编号。
    productId: number,
  ) {
    // 1. 查询可用门店详情。
    await this.store(storeId)
    // 2. 查询当前业务明细。
    const item = await this.repo.findProduct(storeId, productId)
    // 3. 不满足要求时提示：该门店暂未上架这款商品。
    if (!item) throw new NotFoundException('该门店暂未上架这款商品')
    // 4. 整理商城商品响应字段。
    return this.serialize(item)
  }
}
