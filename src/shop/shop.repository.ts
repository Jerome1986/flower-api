import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
// 门店查询返回字段。
export const storeSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  businessHours: true,
  isOpen: true,
  deliveryArea: true,
  deliveryFee: true,
} satisfies Prisma.StoreSelect
// 关联查询配置。
export const include = {
  product: {
    include: {
      category: true,
      specs: {
        where: { enabled: true },
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
      },
    },
  },
  stocks: { select: { specId: true, available: true } },
} satisfies Prisma.StoreProductInclude

// 商城商品数据库访问。
@Injectable()
export class ShopRepository {
  // 注入数据库连接，集中处理商城商品数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 查询启用门店的商城展示信息。
  findStores() {
    // 1. 按条件读取数据库记录。
    return this.prisma.store.findMany({
      where: { enabled: true },
      select: storeSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
  }

  // 查询已启用门店的商城展示信息。
  findStoreById(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.store.findFirst({
      where: { id, enabled: true },
      select: storeSelect,
    })
  }

  // 查询指定门店的可售商品及库存。
  findProducts(
    // 门店编号。
    storeId: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.storeProduct.findMany({
      where: this.where(storeId),
      include,
      orderBy: [{ product: { sortOrder: 'asc' } }, { id: 'asc' }],
    })
  }

  // 按门店和商品 ID 查询可售商品。
  findProduct(
    // 门店编号。
    storeId: number,
    // 商品编号。
    productId: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.storeProduct.findFirst({
      where: { ...this.where(storeId), productId },
      include,
    })
  }
  // 构建门店启用、商品可售及配送方式查询条件。
  private where(
    // 门店编号。
    storeId: number,
  ): Prisma.StoreProductWhereInput {
    // 1. 返回本次处理结果。
    return {
      storeId,
      enabled: true,
      store: { enabled: true },
      OR: [{ pickupEnabled: true }, { deliveryEnabled: true }],
      product: {
        type: 'ORDINARY',
        enabled: true,
        specs: { some: { enabled: true } },
      },
    }
  }
}
