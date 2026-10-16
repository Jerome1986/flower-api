import { Injectable } from '@nestjs/common'
import { Prisma, Store } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { QueryStoreDto } from './dto/query-store.dto'
export const managerInclude = {
  manager: { select: { id: true, phone: true, nickname: true } },
} as const
type StoreWithManager = Store & {
  managerId: number | null
  manager: { id: number; phone: string; nickname: string | null } | null
}
@Injectable()
export class StoreRepository {
  // 注入数据库连接，集中处理门店数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 按手机号创建或更新店长用户。
  saveManager(
    phone: string,
    create: Prisma.UserUncheckedCreateInput,
    update: Prisma.UserUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.user.upsert({
      where: { phone },
      create,
      update,
      select: { id: true, enabled: true },
    })
  }

  // 创建门店并返回店长信息。
  createStore(data: Prisma.StoreCreateInput, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.store.create({
      data,
      include: managerInclude,
    })
  }

  // 按 ID 查询门店及展示所需关联信息。
  findById(id: number) {
    return this.prisma.store.findUnique({
      where: { id },
      include: managerInclude,
    })
  }

  // 读取门店当前绑定的店长 ID。
  findManager(id: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.store.findUnique({
      where: { id },
      select: { managerId: true },
    })
  }

  // 更新门店并返回店长信息。
  updateStore(
    id: number,
    data: Prisma.StoreUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.store.update({
      where: { id },
      data,
      include: managerInclude,
    })
  }

  // 统计店长当前关联的门店数量。
  countByManagerId(currentManagerId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.store.count({ where: { managerId: currentManagerId } })
  }

  // 将不再管理门店的店长恢复为客户角色。
  restoreCustomerRole(
    currentManagerId: number,
    data: Prisma.UserUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.user.updateMany({
      where: { id: currentManagerId, role: 'STORE_MANAGER' },
      data,
    })
  }
  // 在传入事务中按筛选条件分页查询门店及总数。
  async findPage(
    query: QueryStoreDto,
    storeIds: number[] | undefined,
    tx: Prisma.TransactionClient,
  ) {
    const keyword = query.keyword?.trim()
    const where: Prisma.StoreWhereInput = {
      ...(storeIds
        ? { id: storeIds.length === 1 ? storeIds[0] : { in: storeIds } }
        : {}),
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
      ...(query.isOpen !== undefined ? { isOpen: query.isOpen } : {}),
      ...(keyword
        ? {
            OR: [
              ...['code', 'name', 'address', 'phone'].map((field) => ({
                [field]: { contains: keyword },
              })),
              { manager: { is: { phone: { contains: keyword } } } },
            ],
          }
        : {}),
    }
    return [
      await tx.store.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        include: managerInclude,
      }),
      await tx.store.count({ where }),
    ] as const
  }
}
