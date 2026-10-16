import { Injectable } from '@nestjs/common'
import { OrderStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { QuoteOrderDto } from './dto/quote-order.dto'
export const include = {
  item: true,
  logs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude
type SavedOrder = Prisma.OrderGetPayload<{ include: typeof include }>
@Injectable()
export class OrdersRepository {
  // 注入数据库连接，集中处理订单数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 查询可下单的门店商品及目标规格库存。
  findAvailableProduct(dto: QuoteOrderDto, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.storeProduct.findFirst({
      where: {
        storeId: dto.storeId,
        productId: dto.productId,
        enabled: true,
        store: { enabled: true, isOpen: true },
        product: { enabled: true, type: 'ORDINARY' },
      },
      include: {
        store: true,
        product: { include: { category: true } },
        stocks: { where: { specId: dto.specId } },
      },
    })
  }

  // 查询商品所属的启用规格。
  findAvailableSpec(dto: QuoteOrderDto, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.productSpec.findFirst({
      where: { id: dto.specId, productId: dto.productId, enabled: true },
    })
  }

  // 按用户与请求幂等键查询已创建的订单。
  findByRequestKey(
    userId: number,
    requestKey: string,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.order.findUnique({
      where: {
        userId_requestKey: { userId, requestKey: requestKey },
      },
      include,
    })
  }

  // 校验可用数量和版本后预占库存。
  reserveStock(
    stockId: number,
    quantity: number,
    stockVersion: number,
    data: Prisma.StoreStockUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.storeStock.updateMany({
      where: {
        id: stockId,
        available: { gte: quantity },
        version: stockVersion,
      },
      data,
    })
  }

  // 创建订单并返回订单明细与日志。
  createOrder(
    data: Prisma.OrderUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.order.create({
      data,
      include,
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

  // 查询用户的订单列表。
  findByUserId(userId: number) {
    return this.prisma.order.findMany({
      where: { userId },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  // 按用户归属与订单号查询订单。
  findUserOrder(
    userId: number,
    orderNo: string,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.order.findFirst({
      where: { userId, orderNo },
      include,
    })
  }

  // 校验订单状态和版本后更新取消信息。
  cancelOrder(
    orderId: number,
    orderStatus: OrderStatus,
    orderVersion: number,
    data: Prisma.OrderUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.order.updateMany({
      where: { id: orderId, status: orderStatus, version: orderVersion },
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

  // 校验版本和预占数量后释放库存。
  releaseStock(
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

  // 查询最多一百条已超时的待支付订单。
  findExpiredOrders() {
    return this.prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lte: new Date() } },
      select: { userId: true, orderNo: true },
      take: 100,
    })
  }
}
