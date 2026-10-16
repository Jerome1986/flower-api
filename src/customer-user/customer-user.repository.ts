import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CustomerUserQueryDto } from './dto/customer-user-query.dto'
export const select = {
  id: true,
  openId: true,
  phone: true,
  role: true,
  nickname: true,
  avatar: true,
  inviteCode: true,
  enabled: true,
  registeredAt: true,
  lastLoginAt: true,
  updatedAt: true,
  managedStores: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect
type CustomerUserRecord = Prisma.UserGetPayload<{ select: typeof select }>
@Injectable()
export class CustomerUserRepository {
  // 注入数据库连接，集中处理客户数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按 ID 查询客户及展示所需关联信息。
  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id }, select })
  }

  // 更新客户启用状态并返回展示字段。
  updateStatus(id: number, data: Prisma.UserUncheckedUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
      select,
    })
  }
  // 在传入事务中按筛选条件分页查询客户及总数。
  async findPage(query: CustomerUserQueryDto, tx: Prisma.TransactionClient) {
    const keyword = query.keyword?.trim()
    const enabled =
      query.status === 'ACTIVE'
        ? true
        : query.status === 'INACTIVE'
          ? false
          : undefined
    const where: Prisma.UserWhereInput = {
      enabled,
      ...(keyword
        ? {
            OR: [
              { phone: { contains: keyword } },
              { nickname: { contains: keyword } },
              { openId: { contains: keyword } },
              { inviteCode: { contains: keyword } },
            ],
          }
        : {}),
    }
    return [
      await tx.user.findMany({
        where,
        select,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { registeredAt: 'desc' },
      }),
      await tx.user.count({ where }),
    ] as const
  }
}
