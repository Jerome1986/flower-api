import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class BannerRepository {
  // 注入数据库连接，集中处理首页配置数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 读取平台单例配置。
  findConfig(tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.platformConfig.findUnique({
      where: { id: 1 },
    })
  }

  // 创建或更新平台单例配置。
  saveConfig(
    create: Prisma.PlatformConfigUncheckedCreateInput,
    update: Prisma.PlatformConfigUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.platformConfig.upsert({
      where: { id: 1 },
      create,
      update,
    })
  }
}
