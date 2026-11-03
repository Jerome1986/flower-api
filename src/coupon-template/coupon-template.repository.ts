import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CouponTemplateQueryDto } from './dto/coupon-template-query.dto'
// 商品规格关联查询配置。
export const specInclude = {
  product: {
    select: { id: true, name: true, coverImage: true, enabled: true },
  },
} satisfies Prisma.ProductSpecInclude
// 关联查询配置。
export const include = {
  exchangeSpec: { include: specInclude },
  _count: { select: { coupons: true, activities: true } },
} satisfies Prisma.CouponTemplateInclude
// 优惠券模板业务数据类型。
type TemplateDetail = Prisma.CouponTemplateGetPayload<{
  // 关联查询配置。
  include: typeof include
}>
// 优惠券模板业务数据类型。
type ExchangeSpec = Prisma.ProductSpecGetPayload<{
  // 关联查询配置。
  include: typeof specInclude
}>
// 优惠券模板数据库访问。
@Injectable()
export class CouponTemplateRepository {
  // 注入数据库连接，集中处理优惠券模板数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 按 ID 查询优惠券模板及展示所需关联信息。
  findById(
    // 当前操作的记录编号。
    id: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.couponTemplate.findUnique({ where: { id }, include })
  }

  // 查询兑换规格及其商品信息。
  findExchangeSpec(
    // 可兑换的商品规格编号。
    exchangeSpecId: number | null | undefined,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.productSpec.findUnique({
      where: { id: exchangeSpecId! },
      include: specInclude,
    })
  }

  // 统计使用当前模板的赠花活动。
  countGiftActivities(
    // 修改前的记录编号。
    oldId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.marketingActivity.count({
      where: { templateId: oldId, isFlowerGift: true },
    })
  }

  // 创建优惠券模板并返回关联信息。
  createTemplate(
    // 待保存或处理的数据。
    data: Prisma.CouponTemplateUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.couponTemplate.create({ data, include })
  }

  // 更新优惠券模板并返回关联信息。
  updateTemplate(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: Prisma.CouponTemplateUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.couponTemplate.update({ where: { id }, data, include })
  }
  // 在传入事务中按筛选条件分页查询优惠券模板及总数。
  async findPage(
    // 列表查询条件。
    query: CouponTemplateQueryDto,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 整理数据库查询条件。
    const where: Prisma.CouponTemplateWhereInput = {
      type: query.type,
      enabled: query.enabled,
      ...(query.keyword?.trim()
        ? { name: { contains: query.keyword.trim() } }
        : {}),
    }
    // 2. 返回本次处理结果。
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
    // 列表查询条件。
    query: CouponTemplateQueryDto,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 准备去除空白后的搜索关键词。
    const keyword = query.keyword?.trim()
    // 2. 整理数据库查询条件。
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
    // 3. 返回本次处理结果。
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
