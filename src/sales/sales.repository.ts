import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { StoreAccess } from '../common/types/store-access'
import { PrismaService } from '../prisma/prisma.service'

// 收入统计只计入普通订单；整单退款成功后从收入中排除。
const received = Prisma.sql`((o.payment_status IN ('PAID', 'REFUNDING', 'REFUND_FAILED')) OR (o.payment_status = 'NOT_REQUIRED' AND o.payable_amount = 0)) AND NOT EXISTS (SELECT 1 FROM refund r WHERE r.order_id = o.id AND r.status = 'SUCCEEDED')`
const real = Prisma.sql`o.type = 'ORDINARY'`

type Numeric = Prisma.Decimal | bigint | number | null
@Injectable()
export class SalesRepository {
  // 注入数据库连接，集中处理销售统计数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按管理员门店权限范围查询目标门店。
  findStore(
    storeId: number,
    scope: StoreAccess,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
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
    storeId: number,
    start: Date,
    end: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.$queryRaw<
      Array<{
        amount: Numeric
        deliveryAmount: Numeric
        receivedAmount: Numeric
        salesCount: Numeric
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
    storeId: number,
    start: Date,
    end: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.$queryRaw<Array<{ status: string; count: Numeric }>>(Prisma.sql`
        SELECT o.status, COUNT(*) AS count FROM \`order\` o
        WHERE ${real} AND o.store_id = ${storeId} AND o.created_at >= ${start} AND o.created_at < ${end}
        GROUP BY o.status ORDER BY o.status
      `)
  }

  // 汇总指定门店和时间区间的赠花及报销数据。
  sumGifts(
    storeId: number,
    start: Date,
    end: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.$queryRaw<
      Array<{
        quantity: Numeric
        stems: Numeric
        unknownStems: Numeric
        amount: Numeric
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
