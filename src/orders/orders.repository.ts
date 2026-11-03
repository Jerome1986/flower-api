import { Injectable } from '@nestjs/common'
import { OrderStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { QuoteOrderDto } from './dto/quote-order.dto'
// 关联查询配置。
export const include = {
  items: { orderBy: { id: 'asc' as const } },
  logs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude
// 订单业务数据类型。
type SavedOrder = Prisma.OrderGetPayload<{
  // 关联查询配置。
  include: typeof include
}>
// 订单数据库访问。
@Injectable()
export class OrdersRepository {
  // 注入数据库连接，集中处理订单数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 查询可下单的门店商品及目标规格库存。
  findAvailableProduct(
    // 接口请求参数。
    dto: QuoteOrderDto,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
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
  findAvailableSpec(
    // 接口请求参数。
    dto: QuoteOrderDto,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.productSpec.findFirst({
      where: { id: dto.specId, productId: dto.productId, enabled: true },
    })
  }

  // 按用户与请求幂等键查询已创建的订单。
  findByRequestKey(
    // 用户编号。
    userId: number,
    // 客户端下单幂等键。
    requestKey: string,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.order.findUnique({
      where: {
        userId_requestKey: { userId, requestKey: requestKey },
      },
      include,
    })
  }

  // 校验可用数量和版本后预占库存。
  reserveStock(
    // 库存记录编号。
    stockId: number,
    // 商品份数。
    quantity: number,
    // 库存更新版本号。
    stockVersion: number,
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
        available: { gte: quantity },
        version: stockVersion,
      },
      data,
    })
  }

  // 创建订单并返回订单明细与日志。
  createOrder(
    // 待保存或处理的数据。
    data: Prisma.OrderUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.order.create({
      data,
      include,
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

  // 查询用户的订单列表。
  findByUserId(
    // 用户编号。
    userId: number,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.order.findMany({
      where: { userId },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  // 按用户归属与订单号查询订单。
  findUserOrder(
    // 用户编号。
    userId: number,
    // 业务订单编号。
    orderNo: string,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.order.findFirst({
      where: { userId, orderNo },
      include,
    })
  }

  // 校验订单状态和版本后更新取消信息。
  cancelOrder(
    // 订单编号。
    orderId: number,
    // 更新前的订单状态。
    orderStatus: OrderStatus,
    // 更新前的订单版本。
    orderVersion: number,
    // 待保存或处理的数据。
    data: Prisma.OrderUncheckedUpdateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.order.updateMany({
      where: { id: orderId, status: orderStatus, version: orderVersion },
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

  // 校验版本和预占数量后释放库存。
  releaseStock(
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

  // 查询最多一百条已超时的待支付订单。
  findExpiredOrders() {
    // 1. 按条件读取数据库记录。
    return this.prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lte: new Date() } },
      select: { userId: true, orderNo: true },
      take: 100,
    })
  }
}
