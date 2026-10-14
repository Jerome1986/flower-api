import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 查询首条符合条件的门店商品。
  findFirstStoreProduct<T extends Prisma.StoreProductFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreProductFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeProduct.findFirst(args);
  }

  // 查询首条符合条件的商品规格。
  findFirstProductSpec<T extends Prisma.ProductSpecFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductSpecFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productSpec.findFirst(args);
  }

  // 按唯一条件查询订单。
  findUniqueOrder<T extends Prisma.OrderFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.findUnique(args);
  }

  // 批量更新门店库存。
  updateManyStoreStock<T extends Prisma.StoreStockUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreStockUpdateManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeStock.updateMany(args);
  }

  // 新增订单。
  createOrder<T extends Prisma.OrderCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.create(args);
  }

  // 新增库存流水。
  createInventoryLog<T extends Prisma.InventoryLogCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.InventoryLogCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.inventoryLog.create(args);
  }

  // 查询符合条件的订单。
  findManyOrder<T extends Prisma.OrderFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.findMany(args);
  }

  // 查询首条符合条件的订单。
  findFirstOrder<T extends Prisma.OrderFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.findFirst(args);
  }

  // 批量更新订单。
  updateManyOrder<T extends Prisma.OrderUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderUpdateManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.updateMany(args);
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

  // 新增订单日志。
  createOrderLog<T extends Prisma.OrderLogCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderLogCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.orderLog.create(args);
  }

  // 按唯一条件查询，不存在时抛出异常订单。
  findUniqueOrThrowOrder<T extends Prisma.OrderFindUniqueOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderFindUniqueOrThrowArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.findUniqueOrThrow(args);
  }
}
