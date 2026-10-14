import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponTemplateRepository {
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

  // 按唯一条件查询商品规格。
  findUniqueProductSpec<T extends Prisma.ProductSpecFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductSpecFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productSpec.findUnique(args);
  }

  // 查询符合条件的优惠券模板。
  findManyCouponTemplate<T extends Prisma.CouponTemplateFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.CouponTemplateFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.couponTemplate.findMany(args);
  }

  // 统计优惠券模板。
  countCouponTemplate<T extends Prisma.CouponTemplateCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.CouponTemplateCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.couponTemplate.count(args);
  }

  // 查询符合条件的商品规格。
  findManyProductSpec<T extends Prisma.ProductSpecFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductSpecFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productSpec.findMany(args);
  }

  // 统计商品规格。
  countProductSpec<T extends Prisma.ProductSpecCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductSpecCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productSpec.count(args);
  }

  // 统计营销活动。
  countMarketingActivity<T extends Prisma.MarketingActivityCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.MarketingActivityCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.marketingActivity.count(args);
  }

  // 新增优惠券模板。
  createCouponTemplate<T extends Prisma.CouponTemplateCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CouponTemplateCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.couponTemplate.create(args);
  }

  // 更新优惠券模板。
  updateCouponTemplate<T extends Prisma.CouponTemplateUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CouponTemplateUpdateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.couponTemplate.update(args);
  }
}
