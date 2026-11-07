import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { CouponRepository } from './coupon.repository'
import { PrismaService } from '../prisma/prisma.service'

// 用户优惠券业务服务。
@Injectable()
export class CouponGrantService {
  // 注入优惠券数据层，由注册业务提供事务以保证原子性。
  constructor(
    // 业务数据访问层。
    private readonly repo: CouponRepository,
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 新人资格保留七天；领券后的有效期独立沿用模板配置。
  private readonly claimWindowMs = 7 * 24 * 3600000

  // 检查新人资格及奖励活动可用状态。
  private async inspect(
    // 用户编号。
    userId: number,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 校验用户状态并读取已领优惠券及新人活动。
    const user = await this.repo.findUser(userId, tx)
    if (!user?.enabled)
      throw new UnauthorizedException('账号不可用，请重新登录')
    // 用户优惠券信息。
    const coupon = await this.repo.findByGrantKey(`new-user:${userId}`, tx)
    // 营销活动信息。
    const activity = await this.repo.findNewUserActivity(tx)
    // 2. 计算注册后七天内的领取资格。
    const now = Date.now()
    // 新人资格截止时间。
    const claimDeadline = new Date(
      user.registeredAt.getTime() + this.claimWindowMs,
    )
    // 是否处于新人领取期限。
    const eligible =
      now >= user.registeredAt.getTime() && now < claimDeadline.getTime()
    // 3. 检查活动、模板、兑换规格和结算配置。
    const template = activity?.template
    // 活动及奖励配置是否可用。
    const activityAvailable = !!(
      activity?.enabled &&
      activity.isFlowerGift &&
      template?.enabled &&
      template.type === 'EXCHANGE' &&
      template.exchangeSpec?.enabled &&
      template.exchangeSpec.product.enabled &&
      Number.isSafeInteger(template.validityHours) &&
      template.validityHours > 0 &&
      Number.isSafeInteger(template.exchangeQuantity) &&
      (template.exchangeQuantity ?? 0) > 0 &&
      (activity.reimbursementPerUnit === null ||
        !activity.reimbursementPerUnit.isNegative())
    )
    // 4. 整理不可领取的原因编码和提示。
    let reasonCode: string | null = null
    // 业务操作原因。
    let reason: string | null = null
    if (coupon) {
      reasonCode = 'ALREADY_CLAIMED'
      reason = '已领取过新人奖励'
    } else if (!activity) {
      reasonCode = 'NO_ACTIVITY'
      reason = '暂无新人花礼活动'
    } else if (!activity.enabled) {
      reasonCode = 'ACTIVITY_DISABLED'
      reason = '新人花礼活动已停用'
    } else if (!activity.isFlowerGift) {
      reasonCode = 'NOT_FLOWER_GIFT'
      reason = '当前新人奖励不是花礼活动'
    } else if (!activityAvailable) {
      reasonCode = 'REWARD_UNAVAILABLE'
      reason = '花礼奖励暂不可领取'
    } else if (!eligible) {
      reasonCode = 'NOT_ELIGIBLE'
      reason = '仅限注册后7天内领取'
    }
    // 5. 返回领取资格、活动状态和已领优惠券。
    return {
      activity: activity ? { id: activity.id, name: activity.name } : null,
      activityAvailable,
      eligible,
      claimDeadline,
      claimed: !!coupon,
      canClaim: reasonCode === null,
      reasonCode,
      reason,
      coupon: coupon
        ? {
            ...coupon,
            status:
              coupon.status === 'AVAILABLE' && coupon.expiresAt.getTime() <= now
                ? 'EXPIRED'
                : coupon.status,
          }
        : null,
    }
  }

  // 查询当前用户的新人花礼领取状态。
  newUserStatus(
    // 用户编号。
    userId: number,
  ) {
    // 1. 在事务中完成相关查询或更新。
    return this.prisma.$transaction((tx) => this.inspect(userId, tx))
  }

  // 幂等领取新人花礼并重试事务冲突。
  async claimNewUser(
    // 用户编号。
    userId: number,
  ) {
    // 唯一键冲突及事务冲突必须在原事务回滚之后重试，重新读取资格和原券。
    // 1. 事务冲突时有限重试，避免重复领取。
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // 处理前的业务状态。
            // 2. 在事务中重新检查资格，已领取时复用原券。
            const before = await this.inspect(userId, tx)
            if (before.claimed) return { ...before, newlyClaimed: false }
            // 3. 按当前活动发券并返回最新领取状态。
            await this.grantNewUser(userId, tx)
            return { ...(await this.inspect(userId, tx)), newlyClaimed: true }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )
      } catch (error) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        )
          continue
        throw error
      }
    }
  }

  // 校验新人活动规则并在当前事务中发券。
  async grantNewUser(
    // 用户编号。
    userId: number,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 确认用户有领取资格，已领取时返回原券。
    const state = await this.inspect(userId, tx)
    if (state.claimed) return state.coupon
    if (!state.canClaim)
      throw new ConflictException({
        code: state.reasonCode,
        message: state.reason,
      })
    // 2. 使用用户级幂等键避免重复发券。
    const grantKey = `new-user:${userId}`
    // 已存在的业务记录。
    const existing = await this.repo.findByGrantKey(grantKey, tx)
    if (existing) return existing

    // 3. 核对活动、模板和兑换商品仍然可用。
    const activity = await this.repo.findNewUserActivity(tx)
    if (!activity?.enabled || !activity.template.enabled)
      throw new ConflictException('新人花礼活动不可用')
    // 优惠券模板。
    const template = activity.template
    // 商品规格信息。
    const spec = template.exchangeSpec
    if (
      template.type === 'EXCHANGE' &&
      (!spec?.enabled || !spec.product.enabled)
    )
      throw new ConflictException('花礼兑换商品不可用')

    // 模板管理之外的数据变更也必须满足有效期、券面和赠花规则。
    if (
      !Number.isSafeInteger(template.validityHours) ||
      template.validityHours <= 0 ||
      (template.type === 'CASH' &&
        (!template.cashAmount || !template.cashAmount.isPositive())) ||
      (template.type === 'EXCHANGE' &&
        (!Number.isSafeInteger(template.exchangeQuantity) ||
          (template.exchangeQuantity ?? 0) <= 0)) ||
      (activity.isFlowerGift && template.type !== 'EXCHANGE') ||
      (activity.reimbursementPerUnit !== null &&
        (!activity.isFlowerGift || activity.reimbursementPerUnit.isNegative()))
    )
      throw new ConflictException('新人奖励配置异常，请联系管理员')

    // 4. 按模板时长计算优惠券的实际有效期。
    const issuedAt = new Date()
    // 有效期截止时间。
    const expiresAt = new Date(
      issuedAt.getTime() + template.validityHours * 3600000,
    )
    if (!Number.isFinite(expiresAt.getTime()))
      throw new ConflictException('新人奖励有效期配置异常，请联系管理员')

    // 5. 保存优惠券及活动快照，后续模板变更不影响已发券。
    return this.repo.grant(
      {
        code: randomUUID(),
        userId,
        templateId: template.id,
        activityId: activity.id,
        source: 'NEW_USER',
        grantKey,
        name: template.name,
        type: template.type,
        scope: template.scope,
        cashAmount: template.cashAmount,
        exchangeSpecId: template.exchangeSpecId,
        exchangeQuantity: template.exchangeQuantity,
        exchangeProductName: spec?.product.name ?? null,
        exchangeSpecName: spec?.name ?? null,
        activityName: activity.name,
        isFlowerGift: activity.isFlowerGift,
        reimbursementPerUnit: activity.reimbursementPerUnit,
        status: 'AVAILABLE',
        issuedAt,
        expiresAt,
      },
      tx,
    )
  }
}
