import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

// 轮播图数据库访问。
@Injectable()
export class BannerRepository {
  // 注入数据库连接，集中处理首页配置数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 读取平台单例配置。
  findConfig(
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.platformConfig.findUnique({
      where: { id: 1 },
    })
  }

  // 创建或更新平台单例配置。
  saveConfig(
    // 新建记录的数据。
    create: Prisma.PlatformConfigUncheckedCreateInput,
    // 更新记录的数据。
    update: Prisma.PlatformConfigUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.platformConfig.upsert({
      where: { id: 1 },
      create,
      update,
    })
  }
}
