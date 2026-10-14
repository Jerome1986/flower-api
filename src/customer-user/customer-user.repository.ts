import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomerUserRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 按唯一条件查询用户。
  findUniqueUser<T extends Prisma.UserFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.findUnique(args);
  }

  // 查询符合条件的用户。
  findManyUser<T extends Prisma.UserFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.findMany(args);
  }

  // 统计用户。
  countUser<T extends Prisma.UserCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.count(args);
  }

  // 更新用户。
  updateUser<T extends Prisma.UserUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpdateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.update(args);
  }
}
