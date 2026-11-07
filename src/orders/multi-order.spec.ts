jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
import { Prisma } from '@prisma/client'
import { OrdersService } from './orders.service'
import { ManageOrdersService } from './manage-orders.service'
import { allocateCoupon, orderLines } from './order-lines'
import { PaymentService } from '../payment/payment.service'
import { PaymentRepository } from '../payment/payment.repository'

const coupon = (extra = {}) =>
  ({
    id: 7,
    userId: 1,
    name: '礼券',
    type: 'CASH',
    cashAmount: new Prisma.Decimal(10),
    status: 'AVAILABLE',
    currentOrderId: null,
    expiresAt: new Date(Date.now() + 3600000),
    ...extra,
  } as any)
function fixture() {
  let state: any = {
    orders: [],
    stocks: [
      { id: 11, available: 10, reserved: 0, version: 1 },
      { id: 12, available: 8, reserved: 0, version: 1 },
    ],
    logs: [],
    coupon: coupon(),
  }
  let failStock = 0
  const clone = (value: any) => structuredClone(value)
  const tx: any = {
    userCoupon: {
      findUnique: async () => state.coupon,
      findMany: async () => [state.coupon],
      updateMany: async ({ where, data }: any) => {
        if (
          where.status !== state.coupon.status ||
          where.currentOrderId !== state.coupon.currentOrderId
        )
          return { count: 0 }
        Object.assign(state.coupon, data)
        return { count: 1 }
      },
    },
    couponEvent: {
      create: async (v: any) => {
        state.logs.push(v)
      },
    },
  }
  const repo: any = {
    findByRequestKey: async (userId: number, key: string) =>
      state.orders.find((o: any) => o.userId === userId && o.requestKey === key) || null,
    findAvailableProduct: async (dto: any) => ({
      pickupEnabled: true,
      deliveryEnabled: true,
      stocks: [clone(state.stocks.find((s: any) => s.id === dto.specId))],
      product: { name: '鲜花' + dto.productId, coverImage: '' },
      store: { id: 2, name: '花店', deliveryFee: 5 },
    }),
    findAvailableSpec: async (dto: any) => ({
      id: dto.specId,
      name: '一份',
      unit: '份',
      price: 30,
      stemsPerUnit: 8,
    }),
    reserveStock: jest.fn(async (id: number, quantity: number, version: number) => {
      const s = state.stocks.find((s: any) => s.id === id)
      if (id === failStock || s.version !== version || s.available < quantity) return { count: 0 }
      s.available -= quantity
      s.reserved += quantity
      s.version++
      return { count: 1 }
    }),
    createOrder: jest.fn(async (data: any) => {
      const order = {
        ...data,
        id: state.orders.length + 1,
        version: 1,
        items: data.items.create,
        logs: [],
      }
      state.orders.push(order)
      return order
    }),
    createInventoryLog: async (v: any) => {
      state.logs.push(v)
      return v
    },
    findUserOrder: async (_user: number, no: string) =>
      state.orders.find((o: any) => o.orderNo === no),
    findReservations: async (id: number) =>
      state.logs.filter((v: any) => v.orderId === id && v.type === 'RESERVE'),
    getStock: async (id: number) => clone(state.stocks.find((s: any) => s.id === id)),
    releaseStock: jest.fn(async (id: number, version: number, quantity: number) => {
      const s = state.stocks.find((s: any) => s.id === id)
      if (s.version !== version || s.reserved < quantity) return { count: 0 }
      s.available += quantity
      s.reserved -= quantity
      s.version++
      return { count: 1 }
    }),
    cancelOrder: async (id: number, status: string, version: number, data: any) => {
      const order = state.orders.find((o: any) => o.id === id)
      if (order.status !== status || order.version !== version) return { count: 0 }
      Object.assign(order, data, { version: version + 1 })
      return { count: 1 }
    },
    createOrderLog: async () => {},
    getById: async (id: number) => state.orders.find((o: any) => o.id === id),
  }
  const prisma: any = {
    userCoupon: tx.userCoupon,
    $transaction: async (fn: any) => {
      const snapshot = { ...clone({ ...state, coupon: null }), coupon: { ...state.coupon } }
      try {
        return await fn(tx)
      } catch (error) {
        state = snapshot
        throw error
      }
    },
  }
  const matches = (order: any, where: any) => Object.entries(where).every(([key, value]: any) => {
    if (key === 'OR') return value.some((v: any) => matches(order, v))
    if (value === null) return order[key] == null
    if (typeof value === 'object' && value.lt) return order[key] < value.lt
    return order[key] === value
  })
  tx.order = prisma.order = {
    findFirst: async ({ where }: any) => state.orders.find((o: any) => matches(o, where)),
    findUniqueOrThrow: async ({ where }: any) => ({ ...state.orders.find((o: any) => o.id === where.id) }),
    updateMany: async ({ where, data }: any) => {
      const o = state.orders.find((o: any) => matches(o, where))
      if (!o) return { count: 0 }
      for (const [k, v] of Object.entries(data) as any) o[k] = v?.increment !== undefined ? o[k] + v.increment : v
      return { count: 1 }
    },
  }
  tx.payment = prisma.payment = { findFirst: async () => null, updateMany: async () => ({ count: 0 }) }
  tx.orderLog = { create: async ({ data }: any) => { state.logs.push(data) }, findUnique: async ({ where }: any) => state.logs.find((l: any) => l.operationKey === where.operationKey) }
  const payments = new PaymentService(prisma, {} as any, repo, new PaymentRepository({} as any, prisma))
  const service = new OrdersService(repo, { currentUser: async () => ({ id: 1 }) } as any, prisma, payments)
  const input: any = {
    storeId: 2,
    method: 'delivery',
    items: [
      { productId: 1, specId: 11, quantity: 1, remark: '红色' },
      { productId: 2, specId: 12, quantity: 2 },
    ],
    contactName: '花友',
    contactPhone: '13800000000',
    address: '花园路',
    requestKey: 'multi-order-test-0001',
    expectedAmount: 8500,
    couponId: 7,
  }
  return {
    service,
    repo,
    prisma,
    input,
    get state() {
      return state
    },
    fail(id: number) {
      failStock = id
    },
  }
}
describe('多商品订单与待支付生命周期', () => {
  test('配送费只收一次、锁券、幂等复用、取消释放每条库存', async () => {
    const f = fixture()
    const quote = await f.service.quote(1, f.input)
    expect(quote).toMatchObject({
      productAmount: 9000,
      deliveryFee: 500,
      discountAmount: 1000,
      payableAmount: 8500,
    })
    const order = await f.service.create(1, f.input)
    expect(order.status).toBe('PENDING_PAYMENT')
    expect(order.items).toHaveLength(2)
    expect(f.state.coupon.status).toBe('LOCKED')
    f.state.orders[0].items.reverse()
    await f.service.create(1, f.input)
    expect(f.repo.createOrder).toHaveBeenCalledTimes(1)
    await expect(
      f.service.create(1, {
        ...f.input,
        items: [{ ...f.input.items[0], remark: '变化' }, f.input.items[1]],
      }),
    ).rejects.toThrow('重复提交')
    await f.service.cancel(1, order.orderNo)
    await f.service.cancel(1, order.orderNo)
    expect(f.repo.releaseStock).toHaveBeenCalledTimes(2)
    expect(f.state.stocks.map((s: any) => s.available)).toEqual([10, 8])
    expect(f.state.coupon.status).toBe('AVAILABLE')
  })
  test('同规格不同备注按总数量预占一次，整体库存不足拒绝', async () => {
    const f = fixture()
    const input = {
      ...f.input,
      couponId: undefined,
      expectedAmount: 9500,
      items: [
        { productId: 1, specId: 11, quantity: 1, remark: 'A' },
        { productId: 1, specId: 11, quantity: 2, remark: 'B' },
      ],
    }
    const result = await f.service.create(1, input)
    expect(result.items).toHaveLength(2)
    expect(f.repo.reserveStock).toHaveBeenCalledTimes(1)
    expect(f.state.stocks[0].reserved).toBe(3)
    await expect(
      f.service.quote(1, {
        ...input,
        items: input.items.map((item) => ({ ...item, quantity: 4 })),
      }),
    ).rejects.toThrow('库存不足')
  })
  test('后续库存冲突回滚前一条库存，不创建订单或锁券', async () => {
    const f = fixture()
    f.fail(12)
    await expect(f.service.create(1, f.input)).rejects.toThrow('库存已变化')
    expect(f.state.stocks[0].available).toBe(10)
    expect(f.state.orders).toHaveLength(0)
    expect(f.state.coupon.status).toBe('AVAILABLE')
  })
  test('超时释放锁定券，券本身过期则恢复为过期状态', async () => {
    const f = fixture()
    const order = await f.service.create(1, f.input)
    f.state.orders[0].expiresAt = new Date(0)
    f.state.coupon.expiresAt = new Date(0)
    const closed = await f.service.cancel(1, order.orderNo, true)
    expect(closed.status).toBe('CLOSED')
    expect(f.state.coupon.status).toBe('EXPIRED')
    expect(f.state.stocks.every((s: any) => s.reserved === 0)).toBe(true)
  })
  test('金额变化不预占；待支付不能履约', async () => {
    const f = fixture()
    await expect(f.service.create(1, { ...f.input, expectedAmount: 1 })).rejects.toThrow(
      '价格或配送费',
    )
    expect(f.repo.reserveStock).not.toHaveBeenCalled()
    const order = await f.service.create(1, f.input)
    const manager = new ManageOrdersService(
      { findOrder: async () => f.state.orders[0] } as any,
      f.service,
      f.prisma,
    )
    await expect(
      manager.action(
        order.orderNo,
        { action: 'accept', version: 1 } as any,
        { id: 1, role: 'SUPER_ADMIN' } as any,
      ),
    ).rejects.toThrow('尚未支付')
  })
  test('现金分摊精确到分；兑换券跨同规格明细分配', () => {
    expect(
      allocateCoupon(coupon({ cashAmount: new Prisma.Decimal('0.01') }), 1, [
        { specId: 11, quantity: 1, unitPrice: 1 },
        { specId: 12, quantity: 1, unitPrice: 1 },
      ]).discounts,
    ).toEqual([1, 0])
    const allocation = allocateCoupon(
      coupon({ type: 'EXCHANGE', exchangeSpecId: 11, exchangeQuantity: 2 }),
      1,
      [
        { specId: 11, quantity: 1, unitPrice: 3000 },
        { specId: 12, quantity: 1, unitPrice: 5000 },
        { specId: 11, quantity: 2, unitPrice: 3000 },
      ],
    )
    expect(allocation.exchanges).toEqual([1, 0, 1])
    expect(allocation.discountAmount).toBe(6000)
    expect(() => orderLines({ storeId: 2, method: 'pickup', items: [], quantity: 1 })).toThrow()
  })
})
