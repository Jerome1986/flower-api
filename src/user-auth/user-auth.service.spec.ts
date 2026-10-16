import { JwtService } from '@nestjs/jwt'
import { CouponGrantService } from '../coupon/coupon-grant.service'
import { PrismaService } from '../prisma/prisma.service'
import { WxUtil } from '../utils/wx.util'
import { UserAuthRepository } from './user-auth.repository'
import { UserAuthService } from './user-auth.service'

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

describe('微信注册新人奖励事务', () => {
  // 构造注册依赖，分别观察事务内创建和提交后签发令牌。
  function setup() {
    const user = {
      id: 7,
      openId: 'openid',
      phone: '13800000000',
      role: 'CUSTOMER',
      enabled: true,
    }
    const tx = { marker: 'registration transaction' }
    const repo = {
      findUser: jest.fn().mockResolvedValue(null),
      inviterUser: jest.fn().mockResolvedValue({ id: 8, inviteCode: 'invite' }),
      createUser: jest.fn().mockResolvedValue(user),
      updateOpenid: jest.fn(),
    }
    const jwt = { sign: jest.fn().mockReturnValue('token') }
    const wx = {
      getSession: jest.fn().mockResolvedValue({ openid: 'openid' }),
      getPhoneNumber: jest.fn().mockResolvedValue(user.phone),
    }
    const prisma = { $transaction: jest.fn(async (action) => action(tx)) }
    const grant = { grantNewUser: jest.fn().mockResolvedValue(null) }
    const service = new UserAuthService(
      repo as unknown as UserAuthRepository,
      jwt as unknown as JwtService,
      wx as unknown as WxUtil,
      prisma as unknown as PrismaService,
      grant as unknown as CouponGrantService,
    )
    return { user, tx, repo, jwt, wx, prisma, grant, service }
  }

  it('创建用户、邀请关系和新人券传入同一事务，事务结束后签发令牌', async () => {
    const { service, repo, grant, tx, user, jwt } = setup()
    expect(
      await service.wxLogin({
        code: 'code',
        phoneCode: 'phone-code',
        inviterCode: 'invite',
      }),
    ).toEqual({ token: 'token', user })
    expect(repo.inviterUser).toHaveBeenCalledWith('invite', tx)
    expect(repo.createUser).toHaveBeenCalledWith(
      {
        openid: user.openId,
        phone: user.phone,
        inviterId: 8,
        inviterCode: 'invite',
      },
      tx,
    )
    expect(grant.grantNewUser).toHaveBeenCalledWith(user.id, tx)
    expect(jwt.sign.mock.invocationCallOrder[0]).toBeGreaterThan(
      grant.grantNewUser.mock.invocationCallOrder[0],
    )
  })

  it('已有用户登录不再创建账号或发放新人券', async () => {
    const { service, repo, user, grant, prisma } = setup()
    repo.findUser.mockResolvedValue(user)
    await service.wxLogin({ code: 'code', phoneCode: 'phone-code' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(repo.createUser).not.toHaveBeenCalled()
    expect(grant.grantNewUser).not.toHaveBeenCalled()
  })

  it('事务内复查发现已有用户时跳过注册奖励', async () => {
    const { service, repo, user, grant } = setup()
    repo.findUser.mockResolvedValueOnce(null).mockResolvedValueOnce(user)
    await service.wxLogin({ code: 'code', phoneCode: 'phone-code' })
    expect(repo.createUser).not.toHaveBeenCalled()
    expect(grant.grantNewUser).not.toHaveBeenCalled()
  })

  it('发券失败使事务回调拒绝，登录不签发令牌', async () => {
    const { service, grant, jwt, prisma } = setup()
    const failure = new Error('发券失败')
    grant.grantNewUser.mockRejectedValue(failure)
    await expect(
      service.wxLogin({ code: 'code', phoneCode: 'phone-code' }),
    ).rejects.toBe(failure)
    await expect(prisma.$transaction.mock.results[0].value).rejects.toBe(
      failure,
    )
    expect(jwt.sign).not.toHaveBeenCalled()
  })

  it('邀请码无效时不创建用户或优惠券', async () => {
    const { service, repo, grant, jwt } = setup()
    repo.inviterUser.mockResolvedValue(null)
    await expect(
      service.wxLogin({
        code: 'code',
        phoneCode: 'phone-code',
        inviterCode: 'invalid',
      }),
    ).rejects.toThrow('邀请码无效')
    expect(repo.createUser).not.toHaveBeenCalled()
    expect(grant.grantNewUser).not.toHaveBeenCalled()
    expect(jwt.sign).not.toHaveBeenCalled()
  })
})
