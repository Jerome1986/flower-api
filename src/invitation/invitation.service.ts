import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { InvitationRepository } from './invitation.repository'

type Activity = NonNullable<Awaited<ReturnType<InvitationRepository['findActivity']>>>

// 首次注册邀请奖励与当前用户邀请摘要。
@Injectable()
export class InvitationService {
  constructor(private readonly repo: InvitationRepository) {}

  // 检查当前配置，不可用时允许注册但不发券，不补发历史邀请。
  private available(activity: Activity | null): activity is Activity {
    if (!activity?.enabled || !activity.template.enabled) return false
    const t = activity.template
    return Number.isSafeInteger(t.validityHours) && t.validityHours > 0 && t.validityHours <= 87600 &&
      (t.type === 'CASH' ? !!t.cashAmount?.isPositive() :
        !!(t.exchangeSpec?.enabled && t.exchangeSpec.product.enabled &&
          Number.isSafeInteger(t.exchangeQuantity) && (t.exchangeQuantity ?? 0) > 0)) &&
      (!activity.isFlowerGift || t.type === 'EXCHANGE') &&
      (activity.reimbursementPerUnit === null ||
        (activity.isFlowerGift && !activity.reimbursementPerUnit.isNegative()))
  }

  // 仅由首次注册事务调用，关系、奖励和注册一起提交或回滚。
  async rewardRegistration(inviteeId: number, tx: Prisma.TransactionClient) {
    const invitation = await this.repo.findInvitation(inviteeId, tx)
    if (!invitation || invitation.inviterId === inviteeId || !invitation.inviter.enabled) return
    const activity = await this.repo.findActivity(tx)
    if (!this.available(activity)) return
    const t = activity.template
    const issuedAt = new Date()
    return this.repo.grant({
      code: randomUUID(), userId: invitation.inviterId, invitationId: invitation.id,
      templateId: t.id, activityId: activity.id, source: 'INVITATION',
      grantKey: `invite:${inviteeId}`, name: t.name, type: t.type, scope: t.scope,
      cashAmount: t.cashAmount, exchangeSpecId: t.exchangeSpecId,
      exchangeQuantity: t.exchangeQuantity, exchangeProductName: t.exchangeSpec?.product.name ?? null,
      exchangeSpecName: t.exchangeSpec?.name ?? null, activityName: activity.name,
      isFlowerGift: activity.isFlowerGift, reimbursementPerUnit: activity.reimbursementPerUnit,
      status: 'AVAILABLE', issuedAt,
      expiresAt: new Date(issuedAt.getTime() + t.validityHours * 3600000),
    }, tx)
  }

  // 只查询可信登录身份对应的邀请记录与真实奖励数量。
  async summary(userId: number) {
    const user = await this.repo.findUser(userId)
    if (!user?.enabled) throw new UnauthorizedException('账号不可用，请重新登录')
    const [activity, records] = await Promise.all([
      this.repo.findActivity(), this.repo.findRecords(userId),
    ])
    const enabled = this.available(activity)
    return {
      code: user.inviteCode, shareTitle: '邀你一起发现喜欢的鲜花',
      sharePath: `/pages/index/index?inviteCode=${encodeURIComponent(user.inviteCode)}`,
      rules: enabled
        ? `好友通过你的分享首次注册成功后，你可获得一张「${activity.template.name}」。同一好友只奖励一次，已注册用户不参与。奖励券领取后${activity.template.validityHours}小时内有效，适用范围以券面为准。活动停用或奖励配置不可用时不发券，不补发历史邀请奖励。`
        : '当前邀请奖励活动未开放。仍可分享小程序，历史邀请和奖励记录保留。',
      invitedCount: records.length,
      rewardCount: records.reduce((count, record) => count + record.coupons.length, 0),
      records: records.map((record) => ({
        id: String(record.id), inviterId: String(userId), name: '微信好友',
        date: record.createdAt.toISOString(),
        reward: record.coupons.length ? record.coupons.map((coupon) => coupon.name).join('、') : '未发放奖励',
      })),
    }
  }
}
