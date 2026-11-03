import { Injectable } from '@nestjs/common'
import { ActivityTrigger, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
// 关联查询配置。
export const include = {
  template: { include: { exchangeSpec: { include: { product: true } } } },
} satisfies Prisma.MarketingActivityInclude
// 营销活动业务数据类型。
type Activity = Prisma.MarketingActivityGetPayload<{
  // 关联查询配置。
  include: typeof include
}>
// 营销活动数据库访问。
@Injectable()
export class MarketingActivityRepository {
  // 注入数据库连接，集中处理营销活动数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 读取活动奖励模板及兑换商品信息。
  findTemplate(
    // 优惠券模板编号。
    templateId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.couponTemplate.findUnique({
      where: { id: templateId },
      include: { exchangeSpec: { include: { product: true } } },
    })
  }

  // 按 ID 顺序查询营销活动及关联奖励模板。
  findAll() {
    // 1. 按条件读取数据库记录。
    return this.prisma.marketingActivity.findMany({
      include,
      orderBy: { id: 'asc' },
    })
  }

  // 按触发类型创建或更新活动配置。
  saveActivity(
    // 活动触发类型。
    trigger: ActivityTrigger,
    // 新建记录的数据。
    create: Prisma.MarketingActivityUncheckedCreateInput,
    // 更新记录的数据。
    update: Prisma.MarketingActivityUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.marketingActivity.upsert({
      where: { trigger },
      create,
      update,
      include,
    })
  }

  // 按触发类型查询活动和奖励模板。
  findByTrigger(
    // 活动触发类型。
    trigger: ActivityTrigger,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.marketingActivity.findUnique({
      where: { trigger },
      include,
    })
  }

  // 按触发类型更新活动并返回关联模板。
  updateActivity(
    // 活动触发类型。
    trigger: ActivityTrigger,
    // 待保存或处理的数据。
    data: Prisma.MarketingActivityUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.marketingActivity.update({
      where: { trigger },
      data,
      include,
    })
  }
}
