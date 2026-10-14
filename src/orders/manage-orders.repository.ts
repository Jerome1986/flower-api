import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ManageOrdersRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 查询符合条件的门店。
  findManyStore<T extends Prisma.StoreFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.findMany(args);
  }

  // 查询符合条件的订单。
  findManyOrder<T extends Prisma.OrderFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.findMany(args);
  }

  // 统计订单。
  countOrder<T extends Prisma.OrderCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.count(args);
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
