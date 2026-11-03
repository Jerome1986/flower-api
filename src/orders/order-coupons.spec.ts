jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
import { Prisma } from '@prisma/client'
import { couponDiscount, consumeCoupon, returnCoupon } from './order-coupons'
import { OrdersService } from './orders.service'

const coupon = (extra = {}) => ({ id: 7, userId: 1, name: '新人券', type: 'EXCHANGE', scope: 'ALL', exchangeSpecId: 11, exchangeQuantity: 1, status: 'AVAILABLE', currentOrderId: null, expiresAt: new Date(Date.now() + 3600000), cashAmount: null, isFlowerGift: true, reimbursementPerUnit: new Prisma.Decimal(2), ...extra }) as any

describe('普通订单用券（不接微信支付）', () => {
  test('兑换指定规格和份数；现金券最多抵商品金额', () => {
    expect(couponDiscount(coupon(), 1, 11, 2, 3000)).toBe(3000)
    expect(couponDiscount(coupon({ type: 'CASH', cashAmount: new Prisma.Decimal(100) }), 1, 11, 2, 3000)).toBe(6000)
  })
  test.each([
    { userId: 2 }, { status: 'USED' }, { status: 'LOCKED' }, { currentOrderId: 8 },
    { expiresAt: new Date(0) }, { exchangeSpecId: 12 }, { exchangeQuantity: 3 },
  ])('拒绝越权、过期、占用或不适用的券 %j', (extra) => {
    expect(() => couponDiscount(coupon(extra), 1, 11, 2, 3000)).toThrow()
  })
  test('并发用同一张券只有一次成功', async () => {
    let used = false
    const tx = { userCoupon: { updateMany: jest.fn(async () => {
      if (used) return { count: 0 }
      used = true
      return { count: 1 }
    }) }, couponEvent: { create: jest.fn() } } as any
    const results = await Promise.allSettled([consumeCoupon(tx, coupon(), 1, 20), consumeCoupon(tx, coupon(), 1, 21)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(tx.couponEvent.create).toHaveBeenCalledTimes(1)
  })
  test.each([false, true])('取消返券保留有效期，已过期=%s', async (expired) => {
    const saved = coupon({ status: 'USED', currentOrderId: 20, expiresAt: new Date(expired ? 0 : Date.now() + 3600000) })
    const tx = { userCoupon: { findUnique: jest.fn(async () => saved), updateMany: jest.fn(async () => ({ count: 1 })) }, couponEvent: { create: jest.fn() } } as any
    await returnCoupon(tx, 7, 1, 20)
    const update = tx.userCoupon.updateMany.mock.calls[0][0].data
    expect(update.status).toBe(expired ? 'EXPIRED' : 'AVAILABLE')
    expect(update.currentOrderId).toBeNull()
    expect(update.expiresAt).toBeUndefined()
  })
  function fixture() {
    const c = coupon()
    const tx = { userCoupon: { findUnique: jest.fn(async () => c), updateMany: jest.fn(async (_args: any) => ({ count: 1 })) }, couponEvent: { create: jest.fn() } }
    const stock = { id: 3, available: 5, reserved: 0, version: 1 }
    const repo = {
      findByRequestKey: jest.fn(async () => null),
      findAvailableProduct: jest.fn(async () => ({ pickupEnabled: true, deliveryEnabled: true, stocks: [stock], product: { name: '玫瑰', coverImage: '' }, store: { id: 2, name: '门店', deliveryFee: new Prisma.Decimal(5) } })),
      findAvailableSpec: jest.fn(async () => ({ id: 11, price: new Prisma.Decimal(30), name: '一份', unit: '份', stemsPerUnit: 8 })),
      reserveStock: jest.fn(async () => ({ count: 1 })),
      createOrder: jest.fn(async (data) => ({ id: 20, ...data, items: data.items.create, logs: [] })),
      createInventoryLog: jest.fn(),
    }
    const prisma = { userCoupon: tx.userCoupon, $transaction: async (fn) => fn(tx) }
    const service = new OrdersService(repo as any, { currentUser: jest.fn() } as any, prisma as any, {} as any)
    const input = { storeId: 2, productId: 1, specId: 11, quantity: 1, method: 'pickup', couponId: 7, expectedAmount: 0, contactName: '花友', contactPhone: '13800000000', requestKey: 'order-test-0000000001' } as any
    return { service, repo, tx, input }
  }
  test('零元下单保存优惠、赠花快照和用券流水，重复请求复用原单', async () => {
    const { service, repo, tx, input } = fixture()
    const result = await service.create(1, input)
    expect(result.payableAmount).toBe(0)
    expect(result.discountAmount).toBe(3000)
    const saved = repo.createOrder.mock.calls[0][0]
    expect(saved.items.create[0].giftStems).toBe(8)
    expect(saved.items.create[0].reimbursementAmount.toNumber()).toBe(2)
    expect(saved.confirmedAt).toBeInstanceOf(Date)
    expect(tx.couponEvent.create).toHaveBeenCalledTimes(1)
    repo.findByRequestKey.mockResolvedValue({ id: 20, ...saved, items: saved.items.create, logs: [] } as any)
    await service.create(1, input)
    expect(repo.createOrder).toHaveBeenCalledTimes(1)
    await expect(service.create(1, { ...input, couponId: 8 })).rejects.toThrow('重复提交')
  })
  test('含配送费的用券订单创建待支付并锁券', async () => {
    const { service, repo, tx, input } = fixture()
    const result = await service.create(1, { ...input, method: 'delivery', address: '花园路', expectedAmount: 500 })
    expect(result.status).toBe('PENDING_PAYMENT')
    expect(result.paymentStatus).toBe('PENDING')
    expect(repo.reserveStock).toHaveBeenCalled()
    expect(tx.userCoupon.updateMany.mock.calls[0][0].data.status).toBe('LOCKED')
  })
  test('拒绝客户端伪造优惠后金额', async () => {
    const { service, repo, input } = fixture()
    await expect(service.create(1, { ...input, expectedAmount: 1 })).rejects.toThrow('价格或配送费已变化')
    expect(repo.reserveStock).not.toHaveBeenCalled()
  })
  test('取消零元订单返券和释放库存；重复取消不重复返券', async () => {
    const { service, repo, tx, input } = fixture()
    await service.create(1, input)
    const data = repo.createOrder.mock.calls[0][0]
    const saved = { id: 20, version: 1, ...data, items: data.items.create, logs: [] }
    tx.userCoupon.findUnique.mockResolvedValue(coupon({ status: 'USED', currentOrderId: 20 }))
    Object.assign(repo, {
      findUserOrder: jest.fn(async () => saved),
      cancelOrder: jest.fn(async () => { saved.status = 'CANCELLED'; return { count: 1 } }),
      findReservations: jest.fn(async () => ([{ stockId: 3, reservedBefore: 0, reservedAfter: 1 }])),
      getStock: jest.fn(async () => ({ id: 3, version: 2, available: 4, reserved: 1 })),
      releaseStock: jest.fn(async () => ({ count: 1 })),
      createOrderLog: jest.fn(),
      getById: jest.fn(async () => saved),
    })
    await service.cancel(1, saved.orderNo)
    await service.cancel(1, saved.orderNo)
    expect((repo as any).releaseStock).toHaveBeenCalledTimes(1)
    expect(tx.couponEvent.create.mock.calls.filter(([arg]) => arg.data.type === 'RETURNED')).toHaveLength(1)
  })
})
