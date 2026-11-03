import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CustomerUserQueryDto } from './dto/customer-user-query.dto'
// 查询返回的字段范围。
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
// 客户用户业务数据类型。
type CustomerUserRecord = Prisma.UserGetPayload<{
  // 查询返回的字段范围。
  select: typeof select
}>
// 客户用户数据库访问。
@Injectable()
export class CustomerUserRepository {
  // 注入数据库连接，集中处理客户数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 按 ID 查询客户及展示所需关联信息。
  findById(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.user.findUnique({ where: { id }, select })
  }

  // 更新客户启用状态并返回展示字段。
  updateStatus(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: Prisma.UserUncheckedUpdateInput,
  ) {
    // 1. 保存本次业务数据变更。
    return this.prisma.user.update({
      where: { id },
      data,
      select,
    })
  }
  // 在传入事务中按筛选条件分页查询客户及总数。
  async findPage(
    // 列表查询条件。
    query: CustomerUserQueryDto,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 准备去除空白后的搜索关键词。
    const keyword = query.keyword?.trim()
    // 2. 准备是否启用。
    const enabled =
      query.status === 'ACTIVE'
        ? true
        : query.status === 'INACTIVE'
          ? false
          : undefined
    // 3. 整理数据库查询条件。
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
    // 4. 返回本次处理结果。
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
