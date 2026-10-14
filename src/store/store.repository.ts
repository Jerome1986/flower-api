import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 新增或更新用户。
  upsertUser<T extends Prisma.UserUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpsertArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.upsert(args);
  }

  // 新增门店。
  createStore<T extends Prisma.StoreCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.create(args);
  }

  // 查询符合条件的门店。
  findManyStore<T extends Prisma.StoreFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.findMany(args);
  }

  // 统计门店。
  countStore<T extends Prisma.StoreCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.count(args);
  }

  // 按唯一条件查询门店。
  findUniqueStore<T extends Prisma.StoreFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.findUnique(args);
  }

  // 更新门店。
  updateStore<T extends Prisma.StoreUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreUpdateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.update(args);
  }

  // 批量更新用户。
  updateManyUser<T extends Prisma.UserUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpdateManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.updateMany(args);
  }
}
