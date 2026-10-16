import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AdminAccountQueryDto } from './dto/admin-account-query.dto'
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

@Injectable()
export class AdminAccountRepository {
  // 注入数据库连接，集中处理管理员账号数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按 ID 查询管理员账号及展示所需关联信息。
  findById(id: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.admin.findUnique({ where: { id }, select })
  }

  // 统计当前账号以外仍启用的超级管理员。
  countOtherSuperAdmins(id: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.admin.count({
      where: { role: 'SUPER_ADMIN', status: true, id: { not: id } },
    })
  }

  // 创建管理员账号并返回展示字段。
  createAdmin(
    data: Prisma.AdminUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.admin.create({ data, select })
  }

  // 更新管理员账号并返回展示字段。
  updateAdmin(
    id: number,
    data: Prisma.AdminUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.admin.update({
      where: { id },
      data,
      select,
    })
  }
  // 在传入事务中按筛选条件分页查询管理员账号及总数。
  async findPage(query: AdminAccountQueryDto, tx: Prisma.TransactionClient) {
    const keyword = query.keyword?.trim()
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
