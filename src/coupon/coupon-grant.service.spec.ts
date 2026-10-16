import { ConflictException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CouponGrantService } from './coupon-grant.service'
import { CouponRepository } from './coupon.repository'

describe('新人优惠券发放', () => {
  // 构造现金券活动及事务客户端，直接验证实际 Repository 的数据库调用。
  function setup() {
    const activity = {
      id: 2,
      name: '新人礼',
      enabled: true,
      isFlowerGift: false,
      reimbursementPerUnit: null as Prisma.Decimal | null,
      template: {
        id: 3,
        name: '新人现金券',
        enabled: true,
        type: 'CASH',
        scope: 'ALL',
        cashAmount: new Prisma.Decimal('12.34') as Prisma.Decimal | null,
        validityHours: 120,
        exchangeSpecId: null as number | null,
        exchangeQuantity: null as number | null,
        exchangeSpec: null as null | {
          name: string
          enabled: boolean
          product: { name: string; enabled: boolean }
        },
      },
    }
    const db = {
      marketingActivity: { findUnique: jest.fn().mockResolvedValue(activity) },
      userCoupon: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockImplementation(async ({ create }) => ({ id: 10, ...create })),
      },
    }
    const tx = db as unknown as Prisma.TransactionClient
    return {
      activity,
      db,
      tx,
      service: new CouponGrantService(new CouponRepository()),
    }
  }

  it('现金券复制元金额及活动快照，并同时创建发放流水和有效期', async () => {
    const { service, db, tx } = setup()
    const coupon = await service.grantNewUser(7, tx)
    expect(db.marketingActivity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trigger: 'NEW_USER' } }),
    )
    expect(coupon).toEqual(
      expect.objectContaining({
        userId: 7,
        templateId: 3,
        activityId: 2,
        source: 'NEW_USER',
        grantKey: 'new-user:7',
        name: '新人现金券',
        activityName: '新人礼',
        status: 'AVAILABLE',
        cashAmount: new Prisma.Decimal('12.34'),
        events: {
          create: {
            type: 'ISSUED',
            operationKey: 'issued:new-user:7',
            remark: '新用户注册奖励',
          },
        },
      }),
    )
    expect(coupon!.expiresAt.getTime() - coupon!.issuedAt.getTime()).toBe(
      120 * 3600000,
    )
    expect(db.userCoupon.upsert.mock.calls[0][0].update).toEqual({})
  })

  it('兑换券保留商品、规格、份数及赠花报销规则快照', async () => {
    const { service, activity, tx } = setup()
    Object.assign(activity.template, {
      type: 'EXCHANGE',
      cashAmount: null,
      exchangeSpecId: 8,
      exchangeQuantity: 2,
      exchangeSpec: {
        name: '一束',
        enabled: true,
        product: { name: '玫瑰', enabled: true },
      },
    })
    activity.isFlowerGift = true
    activity.reimbursementPerUnit = new Prisma.Decimal('2.50')
    expect(await service.grantNewUser(7, tx)).toEqual(
      expect.objectContaining({
        exchangeSpecId: 8,
        exchangeQuantity: 2,
        exchangeProductName: '玫瑰',
        exchangeSpecName: '一束',
        isFlowerGift: true,
        reimbursementPerUnit: new Prisma.Decimal('2.50'),
      }),
    )
  })

  it.each(['missing', 'disabled', 'template', 'spec', 'product'])(
    '奖励不可用时跳过发券：%s',
    async (reason) => {
      const { service, activity, db, tx } = setup()
      if (reason === 'missing')
        db.marketingActivity.findUnique.mockResolvedValue(null)
      if (reason === 'disabled') activity.enabled = false
      if (reason === 'template') activity.template.enabled = false
      if (reason === 'spec' || reason === 'product') {
        activity.template.type = 'EXCHANGE'
        activity.template.exchangeSpec = {
          name: '一束',
          enabled: reason !== 'spec',
          product: { name: '玫瑰', enabled: reason !== 'product' },
        }
      }
      expect(await service.grantNewUser(7, tx)).toBeNull()
      expect(db.userCoupon.upsert).not.toHaveBeenCalled()
    },
  )

  it('重复发放直接返回历史券，不读取新模板或延长有效期', async () => {
    const { service, db, tx } = setup()
    const old = {
      id: 9,
      grantKey: 'new-user:7',
      expiresAt: new Date('2020-01-01'),
    }
    db.userCoupon.findUnique.mockResolvedValue(old)
    expect(await service.grantNewUser(7, tx)).toBe(old)
    expect(db.marketingActivity.findUnique).not.toHaveBeenCalled()
    expect(db.userCoupon.upsert).not.toHaveBeenCalled()
  })

  it('异常配置阻止写券', async () => {
    const { service, activity, db, tx } = setup()
    activity.template.validityHours = 0
    await expect(service.grantNewUser(7, tx)).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(db.userCoupon.upsert).not.toHaveBeenCalled()
  })

  it('写券或嵌套流水失败时向注册事务传递错误', async () => {
    const { service, db, tx } = setup()
    const failure = new Error('写入失败')
    db.userCoupon.upsert.mockRejectedValue(failure)
    await expect(service.grantNewUser(7, tx)).rejects.toBe(failure)
  })
})
