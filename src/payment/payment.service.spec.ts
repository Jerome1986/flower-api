jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
import { Prisma } from '@prisma/client'
import { OrdersRepository } from '../orders/orders.repository'
import { PaymentService } from './payment.service'
import { PaymentRepository } from './payment.repository'
import { WxApiError } from './wechat-pay.client'

function fixture() {
  const amount = new Prisma.Decimal(12)
  const order = {
    id: 1,
    userId: 2,
    orderNo: 'ORD' + 'a'.repeat(32),
    type: 'ORDINARY',
    status: 'PENDING_PAYMENT',
    paymentStatus: 'PENDING',
    version: 0,
    payableAmount: amount,
    couponId: 7,
    expiresAt: new Date(Date.now() + 1800000),
    paymentLeaseUntil: null,
    paymentLeaseToken: null,
  }
  const payment = {
    id: 1,
    orderId: 1,
    outTradeNo: 'F-existing',
    status: 'PENDING',
    amount,
    payerOpenId: 'openid',
    prepayId: 'prepay',
    expiresAt: order.expiresAt,
  }
  const state: Record<string, any[]> = {
    order: [order],
    payment: [payment],
    refund: [],
    orderLog: [],
    couponEvent: [],
    userCoupon: [
      {
        id: 7,
        userId: 2,
        currentOrderId: 1,
        status: 'LOCKED',
        expiresAt: new Date(Date.now() + 3600000),
      },
    ],
    storeStock: [{ id: 5, version: 1, available: 4, reserved: 2 }],
    inventoryLog: [
      {
        id: 1,
        stockId: 5,
        orderId: 1,
        type: 'RESERVE',
        reservedBefore: 0,
        reservedAfter: 2,
      },
    ],
  }
  const clone = (v: any): any =>
    v instanceof Prisma.Decimal
      ? new Prisma.Decimal(v)
      : v instanceof Date
        ? new Date(v)
        : Array.isArray(v)
          ? v.map(clone)
          : v && typeof v === 'object'
            ? Object.fromEntries(
                Object.entries(v).map(([k, v]) => [k, clone(v)]),
              )
            : v
  const matches = (v: any, where: any): boolean =>
    Object.entries(where ?? {}).every(([k, value]: any) => {
      if (k === 'OR') return value.some((w: any) => matches(v, w))
      if (value === null) return v[k] == null
      if (typeof value === 'object') {
        if ('in' in value) return value.in.includes(v[k])
        if ('not' in value) return v[k] !== value.not
        if ('gt' in value) return v[k] > value.gt
        if ('lt' in value) return v[k] < value.lt
        if ('gte' in value) return v[k] >= value.gte
      }
      return v[k] === value
    })
  const db: any = {}
  for (const table of Object.keys(state)) {
    const expand = (v: any, args: any) =>
      v
        ? {
            ...clone(v),
            ...(table === 'refund' && args.include?.payment
              ? {
                  payment: clone(
                    state.payment.find((p) => p.id === v.paymentId),
                  ),
                }
              : {}),
            ...(table === 'order' && args.include
              ? { items: [], logs: [] }
              : {}),
          }
        : null
    const update = (v: any, data: any) => {
      for (const [key, val] of Object.entries(data) as any)
        v[key] =
          val?.increment !== undefined
            ? v[key] + val.increment
            : val?.decrement !== undefined
              ? v[key] - val.decrement
              : val
    }
    const find = async (args: any) =>
      expand(
        state[table].find((v) => matches(v, args.where)),
        args,
      )
    db[table] = {
      findFirst: jest.fn(find),
      findUnique: jest.fn(find),
      findUniqueOrThrow: jest.fn(async (a: any) => {
        const v = await find(a)
        if (!v) throw new Error('missing')
        return v
      }),
      findFirstOrThrow: jest.fn(async (a: any) => {
        const v = await find(a)
        if (!v) throw new Error('missing')
        return v
      }),
      findMany: jest.fn(async (a: any) =>
        state[table]
          .filter((v) => matches(v, a.where))
          .map((v) => expand(v, a)),
      ),
      create: jest.fn(async ({ data }: any) => {
        const v = {
          id: state[table].length + 1,
          ...(table === 'refund' ? { status: 'PENDING', retryCount: 0 } : {}),
          ...clone(data),
        }
        state[table].push(v)
        return clone(v)
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = state[table].filter((v) => matches(v, where))
        rows.forEach((v) => update(v, data))
        return { count: rows.length }
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const v = state[table].find((v) => matches(v, where))
        if (!v) throw new Error('missing')
        update(v, data)
        return clone(v)
      }),
    }
    db[table].upsert = jest.fn(async ({ where, create, update: data }: any) => {
      const v = state[table].find((v) => matches(v, where))
      if (v) {
        update(v, data)
        return clone(v)
      }
      return db[table].create({ data: { status: 'PENDING', ...create } })
    })
  }
  let queue = Promise.resolve()
  db.$transaction = (fn: any) => {
    const run = queue.then(async () => {
      const snapshot = clone(state)
      try {
        return await fn(db)
      } catch (e) {
        for (const k of Object.keys(state)) state[k] = snapshot[k]
        throw e
      }
    })
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
  const transaction = (extra = {}) => ({
    appid: 'app',
    mchid: 'merchant',
    out_trade_no: state.payment[0].outTradeNo,
    transaction_id: 'wx-transaction',
    trade_state: 'SUCCESS',
    success_time: new Date().toISOString(),
    payer: { openid: 'openid' },
    amount: { total: 1200, currency: 'CNY' },
    ...extra,
  })
  const refundResult = (extra = {}) => ({
    mchid: 'merchant',
    out_trade_no: state.payment[0].outTradeNo,
    transaction_id: 'wx-transaction',
    out_refund_no: state.refund[0].outRefundNo,
    refund_id: 'wx-refund',
    status: 'SUCCESS',
    success_time: new Date().toISOString(),
    amount: { total: 1200, refund: 1200, currency: 'CNY' },
    ...extra,
  })
  const wx: any = {
    config: () => ({
      APPID: 'app',
      MCH_ID: 'merchant',
      NOTIFY_URL: 'https://example.com/pay',
      REFUND_NOTIFY_URL: 'https://example.com/refund',
    }),
    query: jest.fn(async () => transaction({ trade_state: 'NOTPAY' })),
    close: jest.fn(async () => ({})),
    queryRefund: jest.fn(async () => {
      throw new WxApiError('RESOURCE_NOT_EXISTS')
    }),
    request: jest.fn(async (_method, path) =>
      path.includes('/refund/')
        ? refundResult({ status: 'PROCESSING' })
        : { prepay_id: 'new-prepay' },
    ),
    clientParams: jest.fn(() => ({
      signType: 'RSA',
      packageValue: 'prepay_id=prepay',
    })),
  }
  const service = new PaymentService(db, wx, new OrdersRepository(db), new PaymentRepository(wx, db))
  return { state, db, wx, service, transaction, refundResult }
}

describe('支付、取消、退款状态一致性', () => {
  test('定制收款后才进入待派单，重复通知不降级已派单状态', async () => {
    const f = fixture()
    f.state.order[0].type = 'CUSTOM'
    await f.service.paid(f.transaction())
    expect(f.state.order[0]).toMatchObject({ status: 'PENDING_DISPATCH', paymentStatus: 'PAID' })
    f.state.order[0].status = 'DISPATCHED'
    await f.service.paid(f.transaction())
    expect(f.state.order[0].status).toBe('DISPATCHED')
    expect(f.state.couponEvent).toHaveLength(1)
  })
  test('未付款定制关闭无需库存预留，返还锁券', async () => {
    const f = fixture()
    f.state.order[0].type = 'CUSTOM'
    f.state.inventoryLog = []
    await f.service.cancel(2, f.state.order[0].orderNo)
    expect(f.state.order[0].status).toBe('CANCELLED')
    expect(f.state.userCoupon[0].status).toBe('AVAILABLE')
  })
  test('并发重复成功通知只核销一次券和写入一次支付日志', async () => {
    const f = fixture()
    await Promise.all([
      f.service.paid(f.transaction()),
      f.service.paid(f.transaction()),
    ])
    expect(f.state.order[0]).toMatchObject({
      status: 'PENDING_ACCEPTANCE',
      paymentStatus: 'PAID',
    })
    expect(f.state.payment[0].transactionId).toBe('wx-transaction')
    expect(f.state.couponEvent).toHaveLength(1)
    expect(f.state.userCoupon[0].status).toBe('USED')
    expect(f.state.storeStock[0].reserved).toBe(2)
  })
  test.each([
    { appid: 'other' },
    { mchid: 'other' },
    { amount: { total: 1, currency: 'CNY' } },
    { payer: { openid: 'other' } },
    { out_trade_no: 'unknown' },
  ])('不匹配的支付通知不改变业务状态 %j', async (extra) => {
    const f = fixture()
    await expect(f.service.paid(f.transaction(extra))).rejects.toThrow()
    expect(f.state.order[0].paymentStatus).toBe('PENDING')
    expect(f.state.couponEvent).toHaveLength(0)
  })
  test('核销券冲突时支付记录和订单一同回滚，允许通知重试', async () => {
    const f = fixture()
    f.state.userCoupon[0].status = 'AVAILABLE'
    await expect(f.service.paid(f.transaction())).rejects.toThrow('优惠券')
    expect(f.state.payment[0].status).toBe('PENDING')
    expect(f.state.order[0].status).toBe('PENDING_PAYMENT')
  })
  test('关单结果未知时保留库存和券，随后重试仅释放一次', async () => {
    const f = fixture()
    f.wx.close.mockRejectedValueOnce(new Error('timeout'))
    await expect(f.service.cancel(2, f.state.order[0].orderNo)).rejects.toThrow(
      'timeout',
    )
    expect(f.state.order[0].status).toBe('CANCELLING')
    expect(f.state.storeStock[0].reserved).toBe(2)
    expect(f.state.userCoupon[0].status).toBe('LOCKED')
    await f.service.cancel(2, f.state.order[0].orderNo)
    await f.service.cancel(2, f.state.order[0].orderNo)
    expect(f.state.order[0].status).toBe('CANCELLED')
    expect(f.state.storeStock[0]).toMatchObject({ available: 6, reserved: 0 })
    expect(
      f.state.inventoryLog.filter((v) => v.type === 'RELEASE'),
    ).toHaveLength(1)
  })
  test('关单与付款竞争：查到成功转退款，成功前不释放库存', async () => {
    const f = fixture()
    f.wx.query
      .mockResolvedValueOnce(f.transaction({ trade_state: 'NOTPAY' }))
      .mockResolvedValue(f.transaction())
    f.wx.close.mockRejectedValueOnce(new WxApiError('ORDERPAID'))
    await f.service.cancel(2, f.state.order[0].orderNo)
    expect(f.state.order[0]).toMatchObject({
      status: 'CANCELLING',
      paymentStatus: 'REFUNDING',
    })
    expect(f.state.storeStock[0].reserved).toBe(2)
    await Promise.all([
      f.service.refunded(f.refundResult()),
      f.service.refunded(f.refundResult()),
    ])
    expect(f.state.order[0]).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
    })
    expect(f.state.userCoupon[0].status).toBe('AVAILABLE')
    expect(
      f.state.inventoryLog.filter((v) => v.type === 'RELEASE'),
    ).toHaveLength(1)
  })
  test('退款异常保持取消中，停止自动提交；迟到成功通知仍可完成', async () => {
    const f = fixture()
    await f.service.paid(f.transaction())
    await f.service.cancel(2, f.state.order[0].orderNo)
    await f.service.refunded(f.refundResult({ status: 'ABNORMAL' }))
    expect(f.state.order[0]).toMatchObject({
      status: 'CANCELLING',
      paymentStatus: 'REFUND_FAILED',
    })
    const count = f.wx.request.mock.calls.length
    await f.service.cancel(2, f.state.order[0].orderNo)
    expect(f.wx.request).toHaveBeenCalledTimes(count)
    expect(f.state.storeStock[0].reserved).toBe(2)
    await f.service.refunded(f.refundResult())
    expect(f.state.order[0].paymentStatus).toBe('REFUNDED')
  })
  test('错误退款金额不能返库存；用户退款不伪造管理员 ID', async () => {
    const f = fixture()
    await f.service.paid(f.transaction())
    await f.service.cancel(2, f.state.order[0].orderNo)
    expect(f.state.refund[0].adminId).toBeNull()
    expect(
      f.state.orderLog.find((l) => l.action === 'CANCEL_REQUEST'),
    ).toMatchObject({ actorType: 'USER', actorId: 2 })
    await expect(
      f.service.refunded(
        f.refundResult({
          amount: { total: 1200, refund: 100, currency: 'CNY' },
        }),
      ),
    ).rejects.toThrow('不匹配')
    expect(f.state.storeStock[0].reserved).toBe(2)
  })
  test('按官方退款回调格式处理不带 currency 的人民币退款', async () => {
    const f = fixture()
    await f.service.paid(f.transaction())
    await f.service.cancel(2, f.state.order[0].orderNo)
    await f.service.refunded(
      f.refundResult({
        status: undefined,
        refund_status: 'SUCCESS',
        amount: { total: 1200, refund: 1200 },
      }),
    )
    expect(f.state.order[0].paymentStatus).toBe('REFUNDED')
  })
  test('超时任务先查到已支付，不关闭或退款', async () => {
    const f = fixture()
    f.state.order[0].expiresAt = new Date(0)
    f.wx.query.mockResolvedValue(f.transaction())
    await f.service.cancel(2, f.state.order[0].orderNo, true)
    expect(f.state.order[0].status).toBe('PENDING_ACCEPTANCE')
    expect(f.wx.close).not.toHaveBeenCalled()
    expect(f.state.refund).toHaveLength(0)
  })
  test('重复下单请求复用稳定交易号和预支付会话，未创建第二笔支付', async () => {
    const f = fixture()
    f.state.payment = []
    f.wx.query.mockRejectedValue(new WxApiError('ORDER_NOT_EXIST'))
    const first = await f.service.pay(2, f.state.order[0].orderNo, 'openid')
    await f.service.pay(2, f.state.order[0].orderNo, 'openid')
    expect(first.orderId).toBe(f.state.order[0].orderNo)
    expect(f.state.payment).toHaveLength(1)
    expect(f.state.payment[0].outTradeNo).toHaveLength(32)
    expect(f.wx.request).toHaveBeenCalledTimes(1)
  })
  test('下单网络超时重试不创建新交易，按原交易号重新查询和提交', async () => {
    const f = fixture()
    f.state.payment = []
    f.wx.query.mockRejectedValue(new WxApiError('ORDER_NOT_EXIST'))
    f.wx.request.mockRejectedValueOnce(new Error('timeout'))
    await expect(
      f.service.pay(2, f.state.order[0].orderNo, 'openid'),
    ).rejects.toThrow('timeout')
    const no = f.state.payment[0].outTradeNo
    await f.service.pay(2, f.state.order[0].orderNo, 'openid')
    expect(f.state.payment).toHaveLength(1)
    expect(f.wx.request.mock.calls[1][2].out_trade_no).toBe(no)
  })
  test('其他用户、过期订单、并发操作锁均拒绝调起支付', async () => {
    const f = fixture()
    await expect(
      f.service.pay(99, f.state.order[0].orderNo, 'openid'),
    ).rejects.toThrow('不存在')
    f.state.order[0].paymentLeaseUntil = new Date(Date.now() + 60000)
    await expect(
      f.service.pay(2, f.state.order[0].orderNo, 'openid'),
    ).rejects.toThrow('处理中')
    f.state.order[0].paymentLeaseUntil = null
    f.state.order[0].expiresAt = new Date(0)
    await expect(
      f.service.pay(2, f.state.order[0].orderNo, 'openid'),
    ).rejects.toThrow('不可支付')
    expect(f.wx.request).not.toHaveBeenCalled()
  })
})
