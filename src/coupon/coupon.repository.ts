import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class CouponRepository {
  // 在注册事务中读取新人活动及模板、兑换商品信息。
  findNewUserActivity(tx: Prisma.TransactionClient) {
    return tx.marketingActivity.findUnique({
      where: { trigger: 'NEW_USER' },
      include: {
        template: { include: { exchangeSpec: { include: { product: true } } } },
      },
    })
  }

  // 按固定发券幂等键查找历史奖励，不受当前模板版本影响。
  findByGrantKey(grantKey: string, tx: Prisma.TransactionClient) {
    return tx.userCoupon.findUnique({ where: { grantKey } })
  }

  // 在同一事务中创建券和发放流水，重复调用保留原始快照及有效期。
  grant(
    data: Prisma.UserCouponUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.userCoupon.upsert({
      where: { grantKey: data.grantKey },
      update: {},
      create: {
        ...data,
        events: {
          create: {
            type: 'ISSUED',
            operationKey: `issued:${data.grantKey}`,
            remark: '新用户注册奖励',
          },
        },
      },
    })
  }
}
