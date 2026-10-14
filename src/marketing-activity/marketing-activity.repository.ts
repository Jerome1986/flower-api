import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MarketingActivityRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 按唯一条件查询优惠券模板。
  findUniqueCouponTemplate<T extends Prisma.CouponTemplateFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.CouponTemplateFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.couponTemplate.findUnique(args);
  }

  // 查询符合条件的营销活动。
  findManyMarketingActivity<T extends Prisma.MarketingActivityFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.MarketingActivityFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.marketingActivity.findMany(args);
  }

  // 新增或更新营销活动。
  upsertMarketingActivity<T extends Prisma.MarketingActivityUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.MarketingActivityUpsertArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.marketingActivity.upsert(args);
  }

  // 按唯一条件查询营销活动。
  findUniqueMarketingActivity<T extends Prisma.MarketingActivityFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.MarketingActivityFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.marketingActivity.findUnique(args);
  }

  // 更新营销活动。
  updateMarketingActivity<T extends Prisma.MarketingActivityUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.MarketingActivityUpdateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.marketingActivity.update(args);
  }
}
