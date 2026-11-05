jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
import { Prisma } from '@prisma/client'
import { BouquetsService } from './bouquets.service'

describe('定制花束用券', () => {
  const setup = () => {
    const coupon = {
      id: 7, userId: 1, status: 'AVAILABLE', currentOrderId: null,
      expiresAt: new Date(Date.now() + 3600000), name: '花束券', type: 'CASH', scope: 'ALL',
      cashAmount: new Prisma.Decimal(10), exchangeSpecId: 11, exchangeQuantity: 1,
      isFlowerGift: false, reimbursementPerUnit: null,
    }
    let saved: any
    const repo = {
      findConfig: async () => ({ customEnabled: true, deliveryFee: new Prisma.Decimal(5) }),
      findAvailableProduct: async () => ({ id: 2, name: '花束', specs: [
        { id: 11, name: '大束', unit: '束', price: new Prisma.Decimal(50), stemsPerUnit: 10 },
      ] }),
      findCoupon: jest.fn(async () => coupon),
      findAvailableCoupons: async () => [coupon],
      findByRequestKey: jest.fn(async () => saved),
      createOrder: jest.fn(async (data) => {
        saved = { ...data, id: 9, items: [data.items.create] }
        return saved
      }),
      findOrder: jest.fn(async () => saved),
      findOrderDetail: jest.fn(async () => saved),
      updateOrder: jest.fn(async () => ({ count: 1 })),
      createOrderLog: jest.fn(),
      getOrderById: jest.fn(async () => saved),
    }
    const tx = {
      userCoupon: {
        updateMany: jest.fn(async (_query: any) => ({ count: 1 })),
        findUnique: jest.fn(async () => ({ ...coupon, status: 'USED', currentOrderId: 9 })),
      },
      couponEvent: { create: jest.fn() },
    }
    const service = new BouquetsService(repo as any, { currentUser: async () => ({ id: 1 }) } as any,
      { serialize: (order) => order } as any, { $transaction: async (fn) => fn(tx) } as any,
      { cancel: jest.fn() } as any)
    const input = { bouquetId: 2, specId: 11, quantity: 1, address: '配送地址', couponId: 7 }
    const submission = { ...input, requestKey: 'request-key-123456', contactName: '花友',
      contactPhone: '13800000000', expectedAmount: 4500 }
    return { service, repo, tx, coupon, input, submission }
  }

  test('现金券封顶商品金额，始终保留配送费；不选券沿用原价', async () => {
    const { service, coupon, input } = setup()
    expect(await service.quote(1, input)).toEqual({ productAmount: 5000, deliveryFee: 500, discountAmount: 1000, payableAmount: 4500 })
    coupon.cashAmount = new Prisma.Decimal(100)
    expect((await service.quote(1, input)).payableAmount).toBe(500)
    expect((await service.quote(1, { ...input, couponId: undefined })).payableAmount).toBe(5500)
  })

  test.each(['owner', 'locked', 'expired', 'quantity', 'spec'])('拒绝不适用券：%s', async (reason) => {
    const { service, coupon, input } = setup()
    if (reason === 'owner') coupon.userId = 2
    if (reason === 'locked') coupon.status = 'LOCKED'
    if (reason === 'expired') coupon.expiresAt = new Date(0)
    if (reason === 'quantity') { coupon.type = 'EXCHANGE'; coupon.exchangeQuantity = 2 }
    if (reason === 'spec') { coupon.type = 'EXCHANGE'; coupon.exchangeSpecId = 99 }
    await expect(service.quote(1, input)).rejects.toThrow()
    expect(await service.availableCoupons(1, input)).toEqual([])
  })

  test('兑换券按规格和份数抵扣，保存赠花快照', async () => {
    const { service, coupon, submission, repo } = setup()
    coupon.type = 'EXCHANGE'
    coupon.isFlowerGift = true
    coupon.reimbursementPerUnit = new Prisma.Decimal(3) as any
    await service.create(1, { ...submission, expectedAmount: 500 })
    const data = repo.createOrder.mock.calls[0][0]
    expect(data.items.create).toMatchObject({ discountAmount: 50, exchangeQuantity: 1, giftQuantity: 1, giftStems: 10 })
    expect(Number(data.items.create.reimbursementAmount)).toBe(3)
  })

  test('同事务核销并记录流水；幂等重试不重复用券，变更券号拒绝', async () => {
    const { service, repo, tx, submission } = setup()
    const order = await service.create(1, submission)
    expect(repo.createOrder.mock.calls[0][0]).toMatchObject({ couponId: 7, discountAmount: 10, payableAmount: 45 })
    expect(tx.userCoupon.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 7, userId: 1, status: 'AVAILABLE', currentOrderId: null }),
      data: expect.objectContaining({ status: 'LOCKED', currentOrderId: 9 }),
    }))
    expect(tx.couponEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'LOCKED' }) }))
    expect(await service.create(1, submission)).toBe(order)
    expect(tx.userCoupon.updateMany).toHaveBeenCalledTimes(1)
    await expect(service.create(1, { ...submission, couponId: 8 })).rejects.toThrow('重复提交')
  })

  test('旧金额被拒绝；并发已核销时抛错让建单事务回滚', async () => {
    const { service, tx, repo, submission } = setup()
    await expect(service.create(1, { ...submission, expectedAmount: 5500 })).rejects.toThrow('重新报价')
    expect(repo.createOrder).not.toHaveBeenCalled()
    tx.userCoupon.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.create(1, submission)).rejects.toThrow('优惠券已被占用')
  })

  test('平台取消返券，保留原有效期，过期券不恢复可用', async () => {
    const { service, tx, coupon, submission } = setup()
    coupon.type = 'EXCHANGE'
    const config = await (service as any).repo.findConfig()
    ;(service as any).repo.findConfig = async () => ({ ...config, deliveryFee: new Prisma.Decimal(0) })
    await service.create(1, { ...submission, expectedAmount: 0 })
    coupon.expiresAt = new Date(0)
    await service.action('order', { action: 'cancel', version: undefined } as any, { id: 1, role: 'PLATFORM_ADMIN' } as any)
    expect(tx.userCoupon.updateMany.mock.calls.at(-1)?.[0]).toMatchObject({
      data: { status: 'EXPIRED', currentOrderId: null, usedAt: null },
    })
  })
})
