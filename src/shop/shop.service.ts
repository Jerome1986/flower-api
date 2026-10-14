import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShopRepository } from './shop.repository';

export const storeSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  businessHours: true,
  isOpen: true,
  deliveryArea: true,
  deliveryFee: true,
} satisfies Prisma.StoreSelect;

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
} satisfies Prisma.StoreProductInclude;

@Injectable()
export class ShopService {
  // 注入商城商品数据访问层及业务依赖。
  constructor(private readonly repo: ShopRepository) {}

  // 转换门店配送费，接口金额使用整数分。
  private serializeStore(
    store: Prisma.StoreGetPayload<{ select: typeof storeSelect }>,
  ) {
    return {
      ...store,
      deliveryFee: Math.round(Number(store.deliveryFee) * 100),
    };
  }

  // 查询当前可访问的门店。
  async stores() {
    const stores = await this.repo.findManyStore({
      where: { enabled: true },
      select: storeSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return stores.map((store) => this.serializeStore(store));
  }

  // 查询可用门店详情。
  async store(id: number) {
    const store = await this.repo.findFirstStore({
      where: { id, enabled: true },
      select: storeSelect,
    });
    if (!store) throw new NotFoundException('门店不存在或已停用');
    return this.serializeStore(store);
  }

  // 构建可售商品的门店、启用状态和配送条件。
  private where(storeId: number): Prisma.StoreProductWhereInput {
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
    };
  }

  // 整理商城商品响应字段。
  private serialize(
    item: Prisma.StoreProductGetPayload<{ include: typeof include }>,
  ) {
    const product = item.product;
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
    };
  }

  // 查询门店已上架的商品。
  async products(storeId: number) {
    await this.store(storeId);
    const items = await this.repo.findManyStoreProduct({
      where: this.where(storeId),
      include,
      orderBy: [{ product: { sortOrder: 'asc' } }, { id: 'asc' }],
    });
    return items.map((item) => this.serialize(item));
  }

  // 查询门店已上架的指定商品。
  async product(storeId: number, productId: number) {
    await this.store(storeId);
    const item = await this.repo.findFirstStoreProduct({
      where: { ...this.where(storeId), productId },
      include,
    });
    if (!item) throw new NotFoundException('该门店暂未上架这款商品');
    return this.serialize(item);
  }
}
