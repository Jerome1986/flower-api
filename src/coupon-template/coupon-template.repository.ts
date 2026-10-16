import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CouponTemplateQueryDto } from './dto/coupon-template-query.dto'
export const specInclude = {
  product: {
    select: { id: true, name: true, coverImage: true, enabled: true },
  },
} satisfies Prisma.ProductSpecInclude
export const include = {
  exchangeSpec: { include: specInclude },
  _count: { select: { coupons: true, activities: true } },
} satisfies Prisma.CouponTemplateInclude
type TemplateDetail = Prisma.CouponTemplateGetPayload<{
  include: typeof include
}>
type ExchangeSpec = Prisma.ProductSpecGetPayload<{
  include: typeof specInclude
}>
@Injectable()
export class CouponTemplateRepository {
  // 注入数据库连接，集中处理优惠券模板数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按 ID 查询优惠券模板及展示所需关联信息。
  findById(id: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.couponTemplate.findUnique({ where: { id }, include })
  }

  // 查询兑换规格及其商品信息。
  findExchangeSpec(
    exchangeSpecId: number | null | undefined,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.productSpec.findUnique({
      where: { id: exchangeSpecId! },
      include: specInclude,
    })
  }

  // 统计使用当前模板的赠花活动。
  countGiftActivities(oldId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.marketingActivity.count({
      where: { templateId: oldId, isFlowerGift: true },
    })
  }

  // 创建优惠券模板并返回关联信息。
  createTemplate(
    data: Prisma.CouponTemplateUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.couponTemplate.create({ data, include })
  }

  // 更新优惠券模板并返回关联信息。
  updateTemplate(
    id: number,
    data: Prisma.CouponTemplateUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.couponTemplate.update({ where: { id }, data, include })
  }
  // 在传入事务中按筛选条件分页查询优惠券模板及总数。
  async findPage(query: CouponTemplateQueryDto, tx: Prisma.TransactionClient) {
    const where: Prisma.CouponTemplateWhereInput = {
      type: query.type,
      enabled: query.enabled,
      ...(query.keyword?.trim()
        ? { name: { contains: query.keyword.trim() } }
        : {}),
    }
    return [
      await tx.couponTemplate.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { id: 'desc' },
      }),
      await tx.couponTemplate.count({ where }),
    ] as const
  }

  // 在传入事务中分页查询启用的兑换规格及总数。
  async findExchangeSpecsPage(
    query: CouponTemplateQueryDto,
    tx: Prisma.TransactionClient,
  ) {
    const keyword = query.keyword?.trim()
    const where: Prisma.ProductSpecWhereInput = {
      enabled: true,
      product: { enabled: true },
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { product: { name: { contains: keyword } } },
            ],
          }
        : {}),
    }
    return [
      await tx.productSpec.findMany({
        where,
        include: specInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      }),
      await tx.productSpec.count({ where }),
    ] as const
  }
}
