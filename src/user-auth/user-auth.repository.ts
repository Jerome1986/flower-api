import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

// 用户资料查询字段。
const userSelect = {
  id: true,
  openId: true,
  phone: true,
  role: true,
  nickname: true,
  avatar: true,
  age: true,
  gender: true,
  enabled: true,
  managedStores: { select: { id: true, name: true } },
} as const

// 用户身份数据库访问。
@Injectable()
export class UserAuthRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 按手机号查询用户。
  updateProfile(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: {
      // 用户昵称。
      nickname: string
      // 用户年龄。
      age?: number | null
      // 用户性别编码。
      gender: number
    },
  ) {
    // 1. 保存本次业务数据变更。
    return this.prisma.user.update({ where: { id }, data, select: userSelect })
  }

  // 按手机号查询用户资料。
  findByPhone(
    // 手机号码。
    phone: string,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.user.findUnique({
      where: { phone },
      select: userSelect,
    })
  }

  // 按 ID 查询用户。
  findById(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    })
  }

  // 微信小程序查用户（核心逻辑）
  findUser(
    // 微信用户标识。
    openId: string,
    // 手机号码。
    phone: string,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.user.findFirst({
      where: {
        OR: [{ openId }, { phone }],
      },
    })
  }

  // 在注册事务中创建用户及邀请关系，与新人发券共同提交或回滚。
  createUser(
    // 待保存或处理的数据。
    data: {
      // 微信用户标识。
      openid: string
      // 手机号码。
      phone: string
      // 邀请人编号。
      inviterId?: number
      // 邀请人邀请码。
      inviterCode?: string
    },
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 保存本次业务数据变更。
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
  updateOpenid(
    // 用户编号。
    userId: number,
    // 微信用户标识。
    openId: string,
  ) {
    // 1. 保存本次业务数据变更。
    return this.prisma.user.update({
      where: { id: userId },
      data: { openId },
    })
  }

  // 获取邀请人信息
  inviterUser(
    // 用户邀请码。
    inviteCode: string,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.user.findUnique({ where: { inviteCode } })
  }

  // 生成邀请码（简单版）
  private generateReferralCode() {
    // 1. 返回本次处理结果。
    return Math.random().toString(36).substring(2, 8)
  }

  // 创建测试用户，已有用户只更新登录时间。
  upsertTestUser(
    // 手机号码。
    phone: string,
  ) {
    // 1. 保存本次业务数据变更。
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
