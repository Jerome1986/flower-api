import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import { SalesQueryDto } from './dto/sales-query.dto';
import { SalesRepository } from './sales.repository';
import { salesRange } from './sales.utils';
type Numeric = Prisma.Decimal | bigint | number | null;
const integer = (value: Numeric) => {
  const result = Number(value ?? 0);
  if (!Number.isSafeInteger(result)) throw new Error('统计数值超出安全范围');
  return result;
};
const cents = (value: Numeric) =>
  integer(new Prisma.Decimal(String(value ?? 0)).mul(100).toNumber());

@Injectable()
export class SalesService {
  // 注入销售统计数据访问层及业务依赖。
  constructor(private readonly repo: SalesRepository) {}

  // 按北京时间统计门店收入、订单状态和赠花数据。
  async summary(admin: CurrentAdmin, query: SalesQueryDto) {
    // 1. 按北京时间计算自然日、近七天或本月的半开统计区间。
    const { start, end } = salesRange(query.period);
    // 同一快照读取权限与各项聚合，避免统计过程中订单更新导致口径不一致。
    return this.repo.transaction(
      async (tx) => {
        // 2. 在统计快照内校验管理员可见门店，禁止跨店读取。
        let scope: Prisma.StoreWhereInput;
        if (admin.role === 'STORE_MANAGER') scope = { managerId: admin.id };
        else if (admin.role === 'STORE_ADMIN' && admin.storeId)
          scope = { id: admin.storeId };
        else if (
          admin.role === 'SUPER_ADMIN' ||
          admin.role === 'PLATFORM_ADMIN'
        )
          scope = {};
        else throw new ForbiddenException('无权查看门店统计');
        const store = await this.repo.findFirstStore(
          {
            where: { AND: [{ id: query.storeId }, scope] },
            select: { id: true, name: true },
          },
          tx,
        );
        if (!store) throw new ForbiddenException('无权查看该门店统计');

        // 3. 仅聚合普通订单，收入和赠花采用各自的履约口径。
        const real = Prisma.sql`o.type = 'ORDINARY'`;
        // 仅整单退款成功扣除；退款中、失败仍保留原收款。零元确认不能产生收入。
        const received = Prisma.sql`((o.payment_status IN ('PAID', 'REFUNDING', 'REFUND_FAILED')) OR (o.payment_status = 'NOT_REQUIRED' AND o.payable_amount = 0)) AND NOT EXISTS (SELECT 1 FROM refund r WHERE r.order_id = o.id AND r.status = 'SUCCEEDED')`;
        const [money] = await this.repo.queryRaw<
          Array<{
            amount: Numeric;
            deliveryAmount: Numeric;
            receivedAmount: Numeric;
            salesCount: Numeric;
            completed: Numeric;
          }>
        >(
          Prisma.sql`
        SELECT COALESCE(SUM(CASE WHEN ${received} THEN GREATEST(o.product_amount - o.discount_amount, 0) ELSE 0 END), 0) AS amount,
          COALESCE(SUM(CASE WHEN ${received} THEN o.delivery_fee ELSE 0 END), 0) AS deliveryAmount,
          COALESCE(SUM(CASE WHEN ${received} THEN o.payable_amount ELSE 0 END), 0) AS receivedAmount,
          COALESCE(SUM(CASE WHEN ${received} THEN 1 ELSE 0 END), 0) AS salesCount, COUNT(*) AS completed
        FROM \`order\` o WHERE ${real} AND o.store_id = ${store.id}
          AND o.completed_at >= ${start} AND o.completed_at < ${end}
      `,
          tx,
        );
        const states = await this.repo.queryRaw<
          Array<{ status: string; count: Numeric }>
        >(
          Prisma.sql`
        SELECT o.status, COUNT(*) AS count FROM \`order\` o
        WHERE ${real} AND o.store_id = ${store.id} AND o.created_at >= ${start} AND o.created_at < ${end}
        GROUP BY o.status ORDER BY o.status
      `,
          tx,
        );
        const [gifts] = await this.repo.queryRaw<
          Array<{
            quantity: Numeric;
            stems: Numeric;
            unknownStems: Numeric;
            amount: Numeric;
            exceptionCount: Numeric;
          }>
        >(
          Prisma.sql`
        SELECT COALESCE(SUM(i.gift_quantity), 0) AS quantity, COALESCE(SUM(i.gift_stems), 0) AS stems,
          COALESCE(SUM(CASE WHEN i.gift_stems IS NULL THEN 1 ELSE 0 END), 0) AS unknownStems,
          COALESCE(SUM(i.unit_price * i.gift_quantity), 0) AS amount,
          COALESCE(SUM(CASE WHEN o.payment_status IN ('REFUNDING', 'REFUNDED', 'REFUND_FAILED')
            OR o.status IN ('CANCELLING', 'CANCELLED', 'CLOSED')
            OR EXISTS (SELECT 1 FROM refund r WHERE r.order_id = o.id AND r.status = 'SUCCEEDED')
            THEN 1 ELSE 0 END), 0) AS exceptionCount
        FROM \`order\` o JOIN order_item i ON i.order_id = o.id
        WHERE ${real} AND o.fulfilled_store_id = ${store.id}
          AND o.completed_at >= ${start} AND o.completed_at < ${end} AND i.gift_quantity > 0
      `,
          tx,
        );
        // 4. 将数据库数值转换为安全整数，金额统一输出为分。
        const amount = cents(money.amount);
        const salesCount = integer(money.salesCount);
        const mappedStates = states.map((row) => ({
          status: row.status,
          count: integer(row.count),
        }));
        return {
          store,
          period: query.period,
          timezone: 'Asia/Shanghai',
          start: start.toISOString(),
          end: end.toISOString(),
          amount,
          deliveryAmount: cents(money.deliveryAmount),
          receivedAmount: cents(money.receivedAmount),
          salesCount,
          completed: integer(money.completed),
          average: salesCount
            ? new Prisma.Decimal(amount)
                .div(salesCount)
                .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
                .toNumber()
            : 0,
          count: mappedStates.reduce((sum, row) => sum + row.count, 0),
          pending: mappedStates
            .filter((row) =>
              [
                'PENDING_ACCEPTANCE',
                'ACCEPTED',
                'READY',
                'DELIVERING',
              ].includes(row.status),
            )
            .reduce((sum, row) => sum + row.count, 0),
          giftQuantity: integer(gifts.quantity),
          giftStems: integer(gifts.unknownStems) ? null : integer(gifts.stems),
          giftUnknownStemsCount: integer(gifts.unknownStems),
          giftAmount: cents(gifts.amount),
          giftExceptionCount: integer(gifts.exceptionCount),
          states: mappedStates,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
