import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

// 管理员身份数据库访问。
@Injectable()
export class AdminRepository {
  // 注入后台账号数据库连接。
  constructor(
    // 数据库访问服务。
    private prisma: PrismaService,
  ) {}

  // 读取后台令牌校验所需的当前账号状态。
  findAuthAdmin(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.admin.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        storeId: true,
        status: true,
        password: true,
      },
    })
  }

  // 读取小程序店长身份及当前负责的门店。
  findAuthManager(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        role: true,
        enabled: true,
        managedStores: { select: { id: true } },
      },
    })
  }

  // 查询管理员账号
  async findOneAdmin(
    // 管理员登录名。
    username: string,
  ) {
    // 1. 按唯一登录账号读取登录校验所需信息。
    return this.prisma.admin.findUnique({ where: { username } })
  }

  // 仅在首次初始化时创建默认超级管理员，已有账号不会重置。
  async createDefaultAdmin(
    // 登录密码。
    password: string,
  ) {
    // 1. 使用唯一账号约束确保并发初始化不会重复创建。
    try {
      return await this.prisma.admin.upsert({
        where: { username: 'admin' },
        update: {},
        create: { username: 'admin', password, role: 'SUPER_ADMIN' },
      })
    } catch (error) {
      // 并发首次登录时，复用另一请求已经创建的账号。
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // 当前管理员信息。
        const admin = await this.findOneAdmin('admin')
        if (admin) return admin
      }
      throw error
    }
  }

  // 查询后台账号总数，防止重命名初始账号后再次创建默认账号。
  async countAdmins() {
    // 1. 首次登录初始化只允许在账号表为空时执行。
    return this.prisma.admin.count()
  }

  // 保存后台账号最近一次成功登录的时间。
  async recordLogin(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 仅更新登录时间，不修改账号权限及密码。
    await this.prisma.admin.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    })
  }
}
