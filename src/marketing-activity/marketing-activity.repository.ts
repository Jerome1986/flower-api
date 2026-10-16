import { Injectable } from '@nestjs/common'
import { ActivityTrigger, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
export const include = {
  template: { include: { exchangeSpec: { include: { product: true } } } },
} satisfies Prisma.MarketingActivityInclude
type Activity = Prisma.MarketingActivityGetPayload<{ include: typeof include }>
@Injectable()
export class MarketingActivityRepository {
  // 注入数据库连接，集中处理营销活动数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 读取活动奖励模板及兑换商品信息。
  findTemplate(templateId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.couponTemplate.findUnique({
      where: { id: templateId },
      include: { exchangeSpec: { include: { product: true } } },
    })
  }

  // 按 ID 顺序查询营销活动及关联奖励模板。
  findAll() {
    return this.prisma.marketingActivity.findMany({
      include,
      orderBy: { id: 'asc' },
    })
  }

  // 按触发类型创建或更新活动配置。
  saveActivity(
    trigger: ActivityTrigger,
    create: Prisma.MarketingActivityUncheckedCreateInput,
    update: Prisma.MarketingActivityUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.marketingActivity.upsert({
      where: { trigger },
      create,
      update,
      include,
    })
  }

  // 按触发类型查询活动和奖励模板。
  findByTrigger(trigger: ActivityTrigger, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.marketingActivity.findUnique({
      where: { trigger },
      include,
    })
  }

  // 按触发类型更新活动并返回关联模板。
  updateActivity(
    trigger: ActivityTrigger,
    data: Prisma.MarketingActivityUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.marketingActivity.update({
      where: { trigger },
      data,
      include,
    })
  }
}
