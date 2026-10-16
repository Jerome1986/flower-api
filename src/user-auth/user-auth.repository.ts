import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const userSelect = {
  id: true,
  phone: true,
  role: true,
  nickname: true,
  enabled: true,
  managedStores: { select: { id: true, name: true } },
} as const

@Injectable()
export class UserAuthRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按手机号查询用户。
  findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { phone },
      select: userSelect,
    })
  }

  // 按 ID 查询用户。
  findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    })
  }

  // 微信小程序查用户（核心逻辑）
  findUser(openId: string, phone: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.user.findFirst({
      where: {
        OR: [{ openId }, { phone }],
      },
    })
  }

  // 在注册事务中创建用户及邀请关系，与新人发券共同提交或回滚。
  createUser(
    data: {
      openid: string
      phone: string
      inviterId?: number
      inviterCode?: string
    },
    tx: Prisma.TransactionClient,
  ) {
    return tx.user.create({
      data: {
        openId: data.openid,
        phone: data.phone,
        nickname: '微信用户',
        avatar: process.env.DEFAULT_AVATAR,
        inviteCode: this.generateReferralCode(),

        ...(data.inviterId != null &&
          data.inviterCode && {
            invitedBy: {
              create: {
                inviteCode: data.inviterCode,
                inviter: {
                  connect: {
                    id: data.inviterId,
                  },
                },
              },
            },
          }),
      },
    })
  }

  // 给没有openid的用户补充openid
  updateOpenid(userId: number, openId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { openId },
    })
  }

  // 获取邀请人信息
  inviterUser(inviteCode: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.user.findUnique({ where: { inviteCode } })
  }

  // 生成邀请码（简单版）
  private generateReferralCode() {
    return Math.random().toString(36).substring(2, 8)
  }

  // 创建测试用户，已有用户只更新登录时间。
  upsertTestUser(phone: string) {
    return this.prisma.user.upsert({
      where: { phone },
      create: {
        phone,
        role: 'CUSTOMER',
        nickname: '爱花的你',
        inviteCode: randomUUID().replace(/-/g, ''),
        lastLoginAt: new Date(),
      },
      update: { lastLoginAt: new Date() },
      select: userSelect,
    })
  }
}
