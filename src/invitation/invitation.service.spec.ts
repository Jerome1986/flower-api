jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
import { Prisma } from '@prisma/client'
import { InvitationService } from './invitation.service'
import { UserAuthService } from '../user-auth/user-auth.service'

describe('首次注册邀请奖励', () => {
  const setup = () => {
    const activity = {
      id: 3, enabled: true, name: '邀请花礼', isFlowerGift: false, reimbursementPerUnit: null,
      template: { id: 4, enabled: true, name: '奖励券', type: 'CASH', scope: 'ALL',
        cashAmount: new Prisma.Decimal(10), validityHours: 24,
        exchangeSpecId: null, exchangeQuantity: null, exchangeSpec: null },
    }
    const coupons = new Map()
    const repo = {
      findActivity: jest.fn(async () => activity),
      findInvitation: jest.fn(async () => ({ id: 8, inviterId: 1, inviter: { enabled: true } })),
      grant: jest.fn(async (data) => {
        if (!coupons.has(data.grantKey)) coupons.set(data.grantKey, data)
        return coupons.get(data.grantKey)
      }),
      findUser: jest.fn(async () => ({ enabled: true, inviteCode: 'ABC123' })),
      findRecords: jest.fn(async () => [
        { id: 8, createdAt: new Date('2026-11-05T00:00:00Z'), coupons: [{ name: '奖励券' }] },
        { id: 9, createdAt: new Date(), coupons: [] },
      ]),
    }
    return { service: new InvitationService(repo as any), repo, activity, coupons }
  }

  test('奖励归邀请人，幂等键按好友生成，复制模板和有效期', async () => {
    const { service, repo, coupons } = setup()
    const tx = {} as any
    const first = await service.rewardRegistration(2, tx)
    const again = await service.rewardRegistration(2, tx)
    expect(first).toBe(again)
    expect(coupons.size).toBe(1)
    expect(repo.grant).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, invitationId: 8, grantKey: 'invite:2', source: 'INVITATION', name: '奖励券',
    }), tx)
    expect(first!.expiresAt.getTime() - first!.issuedAt.getTime()).toBe(24 * 3600000)
  })

  test.each(['disabled', 'template', 'invalid', 'missing', 'self', 'inviter'])('%s 不发券且不阻断注册', async (condition) => {
    const { service, repo, activity } = setup()
    if (condition === 'disabled') activity.enabled = false
    if (condition === 'template') activity.template.enabled = false
    if (condition === 'invalid') activity.template.validityHours = 0
    if (condition === 'missing') repo.findInvitation.mockResolvedValue(null as any)
    if (condition === 'self') repo.findInvitation.mockResolvedValue({ id: 8, inviterId: 2, inviter: { enabled: true } })
    if (condition === 'inviter') repo.findInvitation.mockResolvedValue({ id: 8, inviterId: 1, inviter: { enabled: false } })
    await service.rewardRegistration(2, {} as any)
    expect(repo.grant).not.toHaveBeenCalled()
  })

  test('独立统计邀请人数和实际奖励数，不泄露好友资料', async () => {
    const { service, repo } = setup()
    const result = await service.summary(1)
    expect(repo.findRecords).toHaveBeenCalledWith(1)
    expect(result.invitedCount).toBe(2)
    expect(result.rewardCount).toBe(1)
    expect(result.sharePath).toBe('/pages/index/index?inviteCode=ABC123')
    expect(result.records[0].name).toBe('微信好友')
    repo.findUser.mockResolvedValue({ enabled: false, inviteCode: 'ABC123' })
    await expect(service.summary(1)).rejects.toThrow('账号不可用')
  })

  test('仅首次注册调用奖励，传入创建用户的同一事务；已有用户不调用', async () => {
    const tx = {} as any
    let registered = false
    const user = { id: 2, openId: 'wx' }
    const repo = {
      findUser: jest.fn(async () => registered ? user : null),
      inviterUser: jest.fn(async () => ({ id: 1, inviteCode: 'ABC' })),
      createUser: jest.fn(async () => user),
    }
    const rewardRegistration = jest.fn(async () => undefined)
    const service = new UserAuthService(repo as any, { sign: () => 'token' } as any,
      { getSession: async () => ({ openid: 'wx' }), getPhoneNumber: async () => 'phone' } as any,
      { $transaction: async (fn) => fn(tx) } as any, { rewardRegistration } as any)
    await service.wxLogin({ code: 'wx', phoneCode: 'phone', inviterCode: 'ABC' })
    expect(rewardRegistration).toHaveBeenCalledWith(2, tx)
    registered = true
    await service.wxLogin({ code: 'wx', phoneCode: 'phone', inviterCode: 'ABC' })
    expect(rewardRegistration).toHaveBeenCalledTimes(1)
  })

  test('发券异常向注册事务抛出，不出现注册成功但奖励写入失败', async () => {
    const { service, repo } = setup()
    repo.grant.mockRejectedValue(new Error('数据库异常'))
    await expect(service.rewardRegistration(2, {} as any)).rejects.toThrow('数据库异常')
  })
})
