import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserAuthRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按唯一条件查询用户。
  findUniqueUser<T extends Prisma.UserFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.findUnique(args);
  }

  // 新增或更新用户。
  upsertUser<T extends Prisma.UserUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpsertArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.upsert(args);
  }
}
