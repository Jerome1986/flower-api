import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SalesRepository {
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

  // 执行参数化查询，保留行锁及统计查询的事务上下文。
  queryRaw<T>(query: Prisma.Sql, db: Prisma.TransactionClient = this.prisma) {
    return db.$queryRaw<T>(query);
  }
}
