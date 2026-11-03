import { Injectable } from '@nestjs/common'
import { OrderStatus, Prisma } from '@prisma/client'
import { type CurrentAdmin } from '../common/guards/admin-auth.guard'
import type { StoreAccess } from '../common/types/store-access'
import { PrismaService } from '../prisma/prisma.service'
import { OrderQuery } from './dto/order-query.dto'
// 关联查询配置。
export const include = {
  items: { orderBy: { id: 'asc' as const } },
  logs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude

// 订单数据库访问。
@Injectable()
export class ManageOrdersRepository {
  // 注入数据库连接，集中处理订单数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 查询管理员权限范围内的门店选项。
  findStores(
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.store.findMany({
      where:
        admin.role === 'STORE_MANAGER'
          ? { managerId: admin.id }
          : admin.role === 'STORE_ADMIN'
            ? { id: admin.storeId! }
            : {},
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    })
  }

  // 按订单号及管理员门店权限查询普通订单。
  findOrder(
    // 业务订单或交易编号。
    no: string,
    // 当前账号可访问的门店范围。
    scope: StoreAccess,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.order.findFirst({
      where: { AND: [{ orderNo: no }, this.orderWhere(scope)] },
      include,
    })
  }

  // 按订单状态和版本更新订单，防止并发覆盖。
  updateOrder(
    // 订单编号。
    orderId: number,
    // 更新前的订单版本。
    orderVersion: number,
    // 更新前的订单状态。
    orderStatus: OrderStatus,
    // 待保存或处理的数据。
    data: Prisma.OrderUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.order.updateMany({
      where: { id: orderId, version: orderVersion, status: orderStatus },
      data,
    })
  }

  // 按订单预占幂等键查询库存流水。
  findReservations(
    // 订单编号。
    orderId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.inventoryLog.findMany({
      where: { orderId, type: 'RESERVE' },
      orderBy: { stockId: 'asc' },
    })
  }

  // 按库存 ID 读取库存，不存在时抛出异常。
  getStock(
    // 预留流水对应的库存编号。
    reservationStockId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.storeStock.findUniqueOrThrow({
      where: { id: reservationStockId },
    })
  }

  // 校验版本及预占数量后核销库存。
  consumeStock(
    // 库存记录编号。
    stockId: number,
    // 库存更新版本号。
    stockVersion: number,
    // 商品份数。
    quantity: number,
    // 待保存或处理的数据。
    data: Prisma.StoreStockUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.storeStock.updateMany({
      where: {
        id: stockId,
        version: stockVersion,
        reserved: { gte: quantity },
      },
      data,
    })
  }

  // 写入库存操作流水。
  createInventoryLog(
    // 待保存或处理的数据。
    data: Prisma.InventoryLogUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.inventoryLog.create({
      data,
    })
  }

  // 记录订单状态变更流水。
  createOrderLog(
    // 待保存或处理的数据。
    data: Prisma.OrderLogUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.orderLog.create({
      data,
    })
  }

  // 按 ID 读取订单，不存在时抛出异常。
  getById(
    // 订单编号。
    orderId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.order.findUniqueOrThrow({ where: { id: orderId }, include })
  }
  // 在传入事务中按筛选条件分页查询订单及总数。
  async findPage(
    // 当前账号可访问的门店范围。
    scope: StoreAccess,
    // 列表查询条件。
    query: OrderQuery,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 整理分组汇总结果。
    const groups: Record<string, OrderStatus[]> = {
      unpaid: ['PENDING_PAYMENT'],
      pending: ['PENDING_ACCEPTANCE'],
      preparing: ['ACCEPTED'],
      ready: ['READY'],
      delivering: ['DELIVERING'],
      completed: ['COMPLETED'],
      cancelled: ['CANCELLED', 'CLOSED'],
    }
    // 2. 整理数据库查询条件。
    const where: Prisma.OrderWhereInput = {
      AND: [
        this.orderWhere(scope),
        { storeId: query.storeId, status: query.status },
        query.statusGroup && groups[query.statusGroup]
          ? { status: { in: groups[query.statusGroup] } }
          : {},
        query.keyword?.trim()
          ? {
              OR: [
                { orderNo: { contains: query.keyword.trim() } },
                { contactPhone: { contains: query.keyword.trim() } },
                { contactName: { contains: query.keyword.trim() } },
              ],
            }
          : {},
      ],
    }
    // 3. 返回本次处理结果。
    return [
      await tx.order.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      await tx.order.count({ where }),
    ] as const
  }
  // 按管理员门店范围构建普通订单查询条件。
  private orderWhere(
    // 当前账号可访问的门店范围。
    scope: StoreAccess,
  ): Prisma.OrderWhereInput {
    // 1. 返回本次处理结果。
    return {
      type: 'ORDINARY',
      storeId: scope.storeId,
      ...(scope.managerId !== undefined
        ? { store: { managerId: scope.managerId } }
        : {}),
    }
  }
}
