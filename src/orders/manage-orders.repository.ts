import { Injectable } from '@nestjs/common'
import { OrderStatus, Prisma } from '@prisma/client'
import { type CurrentAdmin } from '../common/guards/admin-auth.guard'
import type { StoreAccess } from '../common/types/store-access'
import { PrismaService } from '../prisma/prisma.service'
import { OrderQuery } from './dto/order-query.dto'
export const include = {
  item: true,
  logs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude

@Injectable()
export class ManageOrdersRepository {
  // 注入数据库连接，集中处理订单数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 查询管理员权限范围内的门店选项。
  findStores(admin: CurrentAdmin) {
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
  findOrder(no: string, scope: StoreAccess, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.order.findFirst({
      where: { AND: [{ orderNo: no }, this.orderWhere(scope)] },
      include,
    })
  }

  // 按订单状态和版本更新订单，防止并发覆盖。
  updateOrder(
    orderId: number,
    orderVersion: number,
    orderStatus: OrderStatus,
    data: Prisma.OrderUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.order.updateMany({
      where: { id: orderId, version: orderVersion, status: orderStatus },
      data,
    })
  }

  // 按订单预占幂等键查询库存流水。
  findReservation(orderId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.inventoryLog.findUnique({
      where: { operationKey: `reserve:${orderId}` },
    })
  }

  // 按库存 ID 读取库存，不存在时抛出异常。
  getStock(reservationStockId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.storeStock.findUniqueOrThrow({
      where: { id: reservationStockId },
    })
  }

  // 校验版本及预占数量后核销库存。
  consumeStock(
    stockId: number,
    stockVersion: number,
    quantity: number,
    data: Prisma.StoreStockUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
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
    data: Prisma.InventoryLogUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.inventoryLog.create({
      data,
    })
  }

  // 记录订单状态变更流水。
  createOrderLog(
    data: Prisma.OrderLogUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.orderLog.create({
      data,
    })
  }

  // 按 ID 读取订单，不存在时抛出异常。
  getById(orderId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.order.findUniqueOrThrow({ where: { id: orderId }, include })
  }
  // 在传入事务中按筛选条件分页查询订单及总数。
  async findPage(
    scope: StoreAccess,
    query: OrderQuery,
    tx: Prisma.TransactionClient,
  ) {
    const groups: Record<string, OrderStatus[]> = {
      unpaid: ['PENDING_PAYMENT'],
      pending: ['PENDING_ACCEPTANCE'],
      preparing: ['ACCEPTED'],
      ready: ['READY'],
      delivering: ['DELIVERING'],
      completed: ['COMPLETED'],
      cancelled: ['CANCELLED', 'CLOSED'],
    }
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
  private orderWhere(scope: StoreAccess): Prisma.OrderWhereInput {
    return {
      type: 'ORDINARY',
      storeId: scope.storeId,
      ...(scope.managerId !== undefined
        ? { store: { managerId: scope.managerId } }
        : {}),
    }
  }
}
