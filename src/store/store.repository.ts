import { Injectable } from '@nestjs/common'
import { Prisma, Store } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { QueryStoreDto } from './dto/query-store.dto'
// 店长关联查询配置。
export const managerInclude = {
  manager: { select: { id: true, phone: true, nickname: true } },
} as const
// 门店业务数据类型。
type StoreWithManager = Store & {
  // 店长用户编号。
  managerId: number | null
  // 店长用户信息。
  manager: {
    // 记录编号。
    id: number
    // 手机号码。
    phone: string
    // 用户昵称。
    nickname: string | null
  } | null
}
// 门店数据库访问。
@Injectable()
export class StoreRepository {
  // 注入数据库连接，集中处理门店数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 按手机号创建或更新店长用户。
  saveManager(
    // 手机号码。
    phone: string,
    // 新建记录的数据。
    create: Prisma.UserUncheckedCreateInput,
    // 更新记录的数据。
    update: Prisma.UserUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.user.upsert({
      where: { phone },
      create,
      update,
      select: { id: true, enabled: true },
    })
  }

  // 创建门店并返回店长信息。
  createStore(
    // 待保存或处理的数据。
    data: Prisma.StoreCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.store.create({
      data,
      include: managerInclude,
    })
  }

  // 按 ID 查询门店及展示所需关联信息。
  findById(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.store.findUnique({
      where: { id },
      include: managerInclude,
    })
  }

  // 读取门店当前绑定的店长 ID。
  findManager(
    // 当前操作的记录编号。
    id: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.store.findUnique({
      where: { id },
      select: { managerId: true },
    })
  }

  // 更新门店并返回店长信息。
  updateStore(
    // 当前操作的记录编号。
    id: number,
    // 待保存或处理的数据。
    data: Prisma.StoreUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.store.update({
      where: { id },
      data,
      include: managerInclude,
    })
  }

  // 统计店长当前关联的门店数量。
  countByManagerId(
    // 当前店长编号。
    currentManagerId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.store.count({ where: { managerId: currentManagerId } })
  }

  // 将不再管理门店的店长恢复为客户角色。
  restoreCustomerRole(
    // 当前店长编号。
    currentManagerId: number,
    // 待保存或处理的数据。
    data: Prisma.UserUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.user.updateMany({
      where: { id: currentManagerId, role: 'STORE_MANAGER' },
      data,
    })
  }
  // 在传入事务中按筛选条件分页查询门店及总数。
  async findPage(
    // 列表查询条件。
    query: QueryStoreDto,
    // 可访问门店编号列表。
    storeIds: number[] | undefined,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 准备去除空白后的搜索关键词。
    const keyword = query.keyword?.trim()
    // 2. 整理数据库查询条件。
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
    // 3. 返回本次处理结果。
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
