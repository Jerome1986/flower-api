import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

// 用户优惠券数据库访问。
@Injectable()
export class CouponRepository {
  // 注入本模块所需的业务依赖。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}
  // 在注册事务中读取新人活动及模板、兑换商品信息。
  findNewUserActivity(
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 按条件读取数据库记录。
    return tx.marketingActivity.findUnique({
      where: { trigger: 'NEW_USER' },
      include: {
        template: { include: { exchangeSpec: { include: { product: true } } } },
      },
    })
  }

  // 按固定发券幂等键查找历史奖励，不受当前模板版本影响。
  findByGrantKey(
    // 优惠券发放幂等键。
    grantKey: string,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 按条件读取数据库记录。
    return tx.userCoupon.findUnique({ where: { grantKey } })
  }

  // 在同一事务中创建券和发放流水，重复调用保留原始快照及有效期。
  grant(
    // 待保存或处理的数据。
    data: Prisma.UserCouponUncheckedCreateInput,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 保存本次业务数据变更。
    return tx.userCoupon.upsert({
      where: { grantKey: data.grantKey },
      update: {},
      create: {
        ...data,
        events: {
          create: {
            type: 'ISSUED',
            operationKey: `issued:${data.grantKey}`,
            remark: '用户主动领取新人奖励',
          },
        },
      },
    })
  }

  // 获取指定用户优惠券列表
  userCoupon(
    // 用户编号。
    userId: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.userCoupon.findMany({
      where: { userId },
    })
  }
}
