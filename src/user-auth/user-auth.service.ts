import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { WxUtil } from '../utils/wx.util'
import { WxPhoneLoginDto } from './dto/wx-phone-login.dto'
import { testPhones } from './user-auth.constants'
import { UserAuthRepository } from './user-auth.repository'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CouponGrantService } from '../coupon/coupon-grant.service'

@Injectable()
export class UserAuthService {
  // 注入用户身份数据访问层及业务依赖。
  constructor(
    private readonly repo: UserAuthRepository,
    private readonly jwt: JwtService,
    private readonly wxUtil: WxUtil,
    private readonly prisma: PrismaService,
    private readonly couponGrant: CouponGrantService,
  ) {}

  // 校验测试登录资格并签发用户令牌。
  async testLogin(phone: string) {
    // 1. 测试登录仅限非生产环境中预设的手机号。
    if (process.env.NODE_ENV === 'production')
      throw new ForbiddenException('正式环境不开放测试登录')
    if (!testPhones.includes(phone))
      throw new ForbiddenException('该手机号未开放测试登录')
    // 2. 先检查已有账号状态，停用账号不更新登录时间。
    const existing = await this.repo.findByPhone(phone)
    if (existing && !existing.enabled)
      throw new UnauthorizedException('账号已停用')
    // 3. 通过唯一手机号复用账号，不覆盖后台设置的身份。
    const user = await this.repo.upsertTestUser(phone)
    if (!user.enabled) throw new UnauthorizedException('账号已停用')
    // 4. 再次确认账号可用，签发用户令牌并返回展示信息。
    return {
      token: this.jwt.sign({ userId: user.id, type: 'user' }),
      userInfo: user,
    }
  }

  // 微信手机号登录
  async wxLogin(dto: WxPhoneLoginDto) {
    const { code, phoneCode, inviterCode } = dto
    // 1. 获取 openId
    const { openid } = await this.wxUtil.getSession(code)
    // 2. 获取手机号
    const phone = await this.wxUtil.getPhoneNumber(phoneCode)

    // 3. 查询当前用户
    let user = await this.repo.findUser(openid, phone)

    // 4. 只有新用户才处理邀请关系
    if (!user) {
      user = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // 再查一次，避免已注册用户进入新人奖励流程。
          const existing = await this.repo.findUser(openid, phone, tx)
          if (existing) return existing
          const inviter = inviterCode
            ? await this.repo.inviterUser(inviterCode, tx)
            : null
          if (inviterCode && !inviter)
            throw new BadRequestException('邀请码无效')

          // 创建用户、邀请关系、优惠券和发券流水使用同一事务。
          const created = await this.repo.createUser(
            {
              openid,
              phone,
              inviterId: inviter?.id,
              inviterCode: inviter?.inviteCode,
            },
            tx,
          )
          await this.couponGrant.grantNewUser(created.id, tx)
          return created
        },
      )
    }

    // 直接登录的用户需要检查是否有openid,如果没有要重新补充openid,防止后端同时创建店长+用户的操作
    if (user && !user.openId) {
      await this.repo.updateOpenid(user.id, openid)
    }

    // 6.生成 token（带角色）
    const token = this.jwt.sign({
      userId: user.id,
      role: user.role,
      type: 'user',
    })

    return {
      token,
      user,
    }
  }

  // 查询当前用户并检查账号可用状态。
  async currentUser(id: number) {
    const user = await this.repo.findById(id)
    if (!user?.enabled)
      throw new UnauthorizedException('账号不可用，请重新登录')
    return user
  }
}
