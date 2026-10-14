import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreProductRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 查询首条符合条件的门店。
  findFirstStore<T extends Prisma.StoreFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.findFirst(args);
  }

  // 查询首条符合条件的门店商品。
  findFirstStoreProduct<T extends Prisma.StoreProductFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreProductFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeProduct.findFirst(args);
  }

  // 查询符合条件的门店。
  findManyStore<T extends Prisma.StoreFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.findMany(args);
  }

  // 查询符合条件的门店商品。
  findManyStoreProduct<T extends Prisma.StoreProductFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreProductFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeProduct.findMany(args);
  }

  // 统计门店商品。
  countStoreProduct<T extends Prisma.StoreProductCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreProductCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeProduct.count(args);
  }

  // 查询符合条件的商品。
  findManyProduct<T extends Prisma.ProductFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.findMany(args);
  }

  // 统计商品。
  countProduct<T extends Prisma.ProductCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.count(args);
  }

  // 按唯一条件查询商品。
  findUniqueProduct<T extends Prisma.ProductFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.findUnique(args);
  }

  // 新增门店商品。
  createStoreProduct<T extends Prisma.StoreProductCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreProductCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeProduct.create(args);
  }

  // createMany门店库存。
  createManyStoreStock<T extends Prisma.StoreStockCreateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreStockCreateManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeStock.createMany(args);
  }

  // 更新门店商品。
  updateStoreProduct<T extends Prisma.StoreProductUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreProductUpdateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeProduct.update(args);
  }

  // 按唯一条件查询库存流水。
  findUniqueInventoryLog<T extends Prisma.InventoryLogFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.InventoryLogFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.inventoryLog.findUnique(args);
  }

  // 按唯一条件查询，不存在时抛出异常门店库存。
  findUniqueOrThrowStoreStock<T extends Prisma.StoreStockFindUniqueOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreStockFindUniqueOrThrowArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeStock.findUniqueOrThrow(args);
  }

  // 批量更新门店库存。
  updateManyStoreStock<T extends Prisma.StoreStockUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreStockUpdateManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeStock.updateMany(args);
  }

  // 新增库存流水。
  createInventoryLog<T extends Prisma.InventoryLogCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.InventoryLogCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.inventoryLog.create(args);
  }

  // 查询符合条件的库存流水。
  findManyInventoryLog<T extends Prisma.InventoryLogFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.InventoryLogFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.inventoryLog.findMany(args);
  }

  // 统计库存流水。
  countInventoryLog<T extends Prisma.InventoryLogCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.InventoryLogCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.inventoryLog.count(args);
  }
}
