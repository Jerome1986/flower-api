import { PrismaService } from '../prisma/prisma.service'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { CurrentAdmin } from '../common/guards/admin-auth.guard'
import type { StoreAccess } from '../common/types/store-access'
import { SalesQueryDto } from './dto/sales-query.dto'
import { SalesRepository } from './sales.repository'
import { salesRange } from './sales.utils'
type Numeric = Prisma.Decimal | bigint | number | null
// 将聚合结果转换为安全整数，拒绝超出精度范围的统计值。
const integer = (value: Numeric) => {
  const result = Number(value ?? 0)
  if (!Number.isSafeInteger(result)) throw new Error('统计数值超出安全范围')
  return result
}
// 将聚合金额由元转换为分，并检查整数精度。
const cents = (value: Numeric) =>
  integer(new Prisma.Decimal(String(value ?? 0)).mul(100).toNumber())

@Injectable()
export class SalesService {
  // 注入销售统计数据访问层及业务依赖。
  constructor(
    private readonly repo: SalesRepository,
    private readonly prisma: PrismaService,
  ) {}

  // 按北京时间统计门店收入、订单状态和赠花数据。
  async summary(admin: CurrentAdmin, query: SalesQueryDto) {
    // 1. 按北京时间计算自然日、近七天或本月的半开统计区间。
    const { start, end } = salesRange(query.period)
    // 同一快照读取权限与各项聚合，避免统计过程中订单更新导致口径不一致。
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 2. 在统计快照内校验管理员可见门店，禁止跨店读取。
        let scope: StoreAccess
        if (admin.role === 'STORE_MANAGER') scope = { managerId: admin.id }
        else if (admin.role === 'STORE_ADMIN' && admin.storeId)
          scope = { storeId: admin.storeId }
        else if (
          admin.role === 'SUPER_ADMIN' ||
          admin.role === 'PLATFORM_ADMIN'
        )
          scope = {}
        else throw new ForbiddenException('无权查看门店统计')
        const store = await this.repo.findStore(query.storeId, scope, tx)
        if (!store) throw new ForbiddenException('无权查看该门店统计')

        // 3. 仅聚合普通订单，收入和赠花采用各自的履约口径。

        // 仅整单退款成功扣除；退款中、失败仍保留原收款。零元确认不能产生收入。

        const [money] = await this.repo.sumRevenue(store.id, start, end, tx)
        const states = await this.repo.countOrderStates(
          store.id,
          start,
          end,
          tx,
        )
        const [gifts] = await this.repo.sumGifts(store.id, start, end, tx)
        // 4. 将数据库数值转换为安全整数，金额统一输出为分。
        const amount = cents(money.amount)
        const salesCount = integer(money.salesCount)
        const mappedStates = states.map((row) => ({
          status: row.status,
          count: integer(row.count),
        }))
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
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
  }
}
