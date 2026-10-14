import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BouquetsRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 按唯一条件查询平台配置。
  findUniquePlatformConfig<T extends Prisma.PlatformConfigFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlatformConfigFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.platformConfig.findUnique(args);
  }

  // 查询符合条件的商品。
  findManyProduct<T extends Prisma.ProductFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.findMany(args);
  }

  // 查询首条符合条件的商品。
  findFirstProduct<T extends Prisma.ProductFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.findFirst(args);
  }

  // 按唯一条件查询订单。
  findUniqueOrder<T extends Prisma.OrderFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.findUnique(args);
  }

  // 新增订单。
  createOrder<T extends Prisma.OrderCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.order.create(args);
  }

  // 新增或更新平台配置。
  upsertPlatformConfig<T extends Prisma.PlatformConfigUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlatformConfigUpsertArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.platformConfig.upsert(args);
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

  // 新增orderDispatch。
  createOrderDispatch<T extends Prisma.OrderDispatchCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.OrderDispatchCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.orderDispatch.create(args);
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
