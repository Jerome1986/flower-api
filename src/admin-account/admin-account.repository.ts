import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AdminAccountQueryDto } from './dto/admin-account-query.dto'
// 查询返回的字段范围。
export const select = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  storeId: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdminSelect

// 管理员账号数据库访问。
@Injectable()
export class AdminAccountRepository {
  // 注入数据库连接，集中处理管理员账号数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 按 ID 查询管理员账号及展示所需关联信息。
  findById(
    // 当前操作的记录编号。
    id: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.admin.findUnique({ where: { id }, select })
  }

  // 统计当前账号以外仍启用的超级管理员。
  countOtherSuperAdmins(
    // 当前操作的记录编号。
    id: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.admin.count({
      where: { role: 'SUPER_ADMIN', status: true, id: { not: id } },
    })
  }

  // 创建管理员账号并返回展示字段。
  createAdmin(
    // 待保存或处理的数据。
    data: Prisma.AdminUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.admin.create({ data, select })
  }

  // 更新管理员账号并返回展示字段。
  updateAdmin(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: Prisma.AdminUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.admin.update({
      where: { id },
      data,
      select,
    })
  }
  // 在传入事务中按筛选条件分页查询管理员账号及总数。
  async findPage(
    // 列表查询条件。
    query: AdminAccountQueryDto,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 准备去除空白后的搜索关键词。
    const keyword = query.keyword?.trim()
    // 2. 整理数据库查询条件。
    const where: Prisma.AdminWhereInput = {
      role: query.role,
      status: query.status,
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { displayName: { contains: keyword } },
            ],
          }
        : {}),
    }
    // 3. 返回本次处理结果。
    return [
      await tx.admin.findMany({
        where,
        select,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { id: 'desc' },
      }),
      await tx.admin.count({ where }),
    ] as const
  }
}
