import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

// 邀请关系和奖励数据访问。
@Injectable()
export class InvitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // 查询当前用户资料。
  findUser(userId: number) {
    return this.prisma.user.findUnique({ where: { id: userId } })
  }

  // 查询邀请活动和奖励模板。
  findActivity(tx: Prisma.TransactionClient = this.prisma) {
    return tx.marketingActivity.findUnique({
      where: { trigger: 'INVITATION' },
      include: { template: { include: { exchangeSpec: { include: { product: true } } } } },
    })
  }

  // 查询本人邀请记录，不返回好友手机号等隐私资料。
  findRecords(userId: number) {
    return this.prisma.invitation.findMany({
      where: { inviterId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true, coupons: { select: { name: true } } },
    })
  }

  // 读取新用户注册事务中已创建的邀请关系。
  findInvitation(inviteeId: number, tx: Prisma.TransactionClient) {
    return tx.invitation.findUnique({
      where: { inviteeId }, include: { inviter: { select: { enabled: true } } },
    })
  }

  // 按好友编号幂等发券，同时记录发放流水。
  grant(data: Prisma.UserCouponUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.userCoupon.upsert({
      where: { grantKey: data.grantKey }, update: {},
      create: { ...data, events: { create: {
        type: 'ISSUED', operationKey: `issued:${data.grantKey}`, remark: '好友首次注册邀请奖励',
      } } },
    })
  }
}
