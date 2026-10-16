import { ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { CouponRepository } from './coupon.repository'

@Injectable()
export class CouponGrantService {
  // 注入优惠券数据层，由注册业务提供事务以保证原子性。
  constructor(private readonly repo: CouponRepository) {}

  // 按新人活动发券；未启用或奖励已停用时跳过，异常配置和写入失败交由外层回滚。
  async grantNewUser(userId: number, tx: Prisma.TransactionClient) {
    const grantKey = `new-user:${userId}`
    const existing = await this.repo.findByGrantKey(grantKey, tx)
    if (existing) return existing

    const activity = await this.repo.findNewUserActivity(tx)
    if (!activity?.enabled || !activity.template.enabled) return null
    const template = activity.template
    const spec = template.exchangeSpec
    if (
      template.type === 'EXCHANGE' &&
      (!spec?.enabled || !spec.product.enabled)
    )
      return null

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

    const issuedAt = new Date()
    const expiresAt = new Date(
      issuedAt.getTime() + template.validityHours * 3600000,
    )
    if (!Number.isFinite(expiresAt.getTime()))
      throw new ConflictException('新人奖励有效期配置异常，请联系管理员')

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
