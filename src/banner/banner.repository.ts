import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BannerRepository {
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

  // 新增或更新平台配置。
  upsertPlatformConfig<T extends Prisma.PlatformConfigUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.PlatformConfigUpsertArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.platformConfig.upsert(args);
  }
}
