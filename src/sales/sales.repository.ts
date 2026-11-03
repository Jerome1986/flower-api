import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { StoreAccess } from '../common/types/store-access'
import { PrismaService } from '../prisma/prisma.service'

// 收入统计只计入普通订单；整单退款成功后从收入中排除。
const received = Prisma.sql`((o.payment_status IN ('PAID', 'REFUNDING', 'REFUND_FAILED')) OR (o.payment_status = 'NOT_REQUIRED' AND o.payable_amount = 0)) AND NOT EXISTS (SELECT 1 FROM refund r WHERE r.order_id = o.id AND r.status = 'SUCCEEDED')`
// 有效收入汇总。
const real = Prisma.sql`o.type = 'ORDINARY'`

// 销售统计业务数据类型。
type Numeric = Prisma.Decimal | bigint | number | null
// 销售统计数据库访问。
@Injectable()
export class SalesRepository {
  // 注入数据库连接，集中处理销售统计数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 按管理员门店权限范围查询目标门店。
  findStore(
    // 门店编号。
    storeId: number,
    // 当前账号可访问的门店范围。
    scope: StoreAccess,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.store.findFirst({
      where: {
        AND: [
          { id: storeId },
          { id: scope.storeId, managerId: scope.managerId },
        ],
      },
      select: { id: true, name: true },
    })
  }

  // 汇总指定门店和时间区间的订单收入。
  sumRevenue(
    // 门店编号。
    storeId: number,
    // 统计区间起点。
    start: Date,
    // 统计区间终点。
    end: Date,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.$queryRaw<
      Array<{
        // 业务金额。
        amount: Numeric
        // 配送费用汇总。
        deliveryAmount: Numeric
        // 实际收款金额。
        receivedAmount: Numeric
        // 销售商品份数。
        salesCount: Numeric
        // 已完成订单汇总。
        completed: Numeric
      }>
    >(Prisma.sql`
        SELECT COALESCE(SUM(CASE WHEN ${received} THEN GREATEST(o.product_amount - o.discount_amount, 0) ELSE 0 END), 0) AS amount,
          COALESCE(SUM(CASE WHEN ${received} THEN o.delivery_fee ELSE 0 END), 0) AS deliveryAmount,
          COALESCE(SUM(CASE WHEN ${received} THEN o.payable_amount ELSE 0 END), 0) AS receivedAmount,
          COALESCE(SUM(CASE WHEN ${received} THEN 1 ELSE 0 END), 0) AS salesCount, COUNT(*) AS completed
        FROM \`order\` o WHERE ${real} AND o.store_id = ${storeId}
          AND o.completed_at >= ${start} AND o.completed_at < ${end}
      `)
  }

  // 按状态统计指定门店和时间区间的订单数量。
  countOrderStates(
    // 门店编号。
    storeId: number,
    // 统计区间起点。
    start: Date,
    // 统计区间终点。
    end: Date,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.$queryRaw<
      Array<{
        // 当前业务状态。
        status: string
        // 符合条件的记录数。
        count: Numeric
      }>
    >(Prisma.sql`
        SELECT o.status, COUNT(*) AS count FROM \`order\` o
        WHERE ${real} AND o.store_id = ${storeId} AND o.created_at >= ${start} AND o.created_at < ${end}
        GROUP BY o.status ORDER BY o.status
      `)
  }

  // 汇总指定门店和时间区间的赠花及报销数据。
  sumGifts(
    // 门店编号。
    storeId: number,
    // 统计区间起点。
    start: Date,
    // 统计区间终点。
    end: Date,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.$queryRaw<
      Array<{
        // 商品份数。
        quantity: Numeric
        // 已统计的花材支数。
        stems: Numeric
        // 支数未配置的赠花份数。
        unknownStems: Numeric
        // 业务金额。
        amount: Numeric
        // 异常数据数量。
        exceptionCount: Numeric
      }>
    >(Prisma.sql`
        SELECT COALESCE(SUM(i.gift_quantity), 0) AS quantity, COALESCE(SUM(i.gift_stems), 0) AS stems,
          COALESCE(SUM(CASE WHEN i.gift_stems IS NULL THEN 1 ELSE 0 END), 0) AS unknownStems,
          COALESCE(SUM(i.unit_price * i.gift_quantity), 0) AS amount,
          COALESCE(SUM(CASE WHEN o.payment_status IN ('REFUNDING', 'REFUNDED', 'REFUND_FAILED')
            OR o.status IN ('CANCELLING', 'CANCELLED', 'CLOSED')
            OR EXISTS (SELECT 1 FROM refund r WHERE r.order_id = o.id AND r.status = 'SUCCEEDED')
            THEN 1 ELSE 0 END), 0) AS exceptionCount
        FROM \`order\` o JOIN order_item i ON i.order_id = o.id
        WHERE ${real} AND o.fulfilled_store_id = ${storeId}
          AND o.completed_at >= ${start} AND o.completed_at < ${end} AND i.gift_quantity > 0
      `)
  }
}
