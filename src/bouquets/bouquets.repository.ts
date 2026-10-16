import { Injectable } from '@nestjs/common'
import { Prisma, type OrderStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CustomOrderQuery } from './dto/custom-order-query.dto'
export const productInclude = {
  specs: {
    where: { enabled: true },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.ProductInclude
export const orderInclude = {
  item: true,
  logs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude
type SavedOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>
@Injectable()
export class BouquetsRepository {
  // 注入数据库连接，集中处理定制花束数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 读取平台单例配置。
  findConfig(tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.platformConfig.findUnique({ where: { id: 1 } })
  }

  // 查询启用的定制商品及有效规格。
  findProducts() {
    return this.prisma.product.findMany({
      where: {
        type: 'CUSTOM',
        enabled: true,
        specs: { some: { enabled: true } },
      },
      include: productInclude,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
  }

  // 按 ID 查询启用的定制商品及有效规格。
  findProductById(id: number) {
    return this.prisma.product.findFirst({
      where: {
        id,
        type: 'CUSTOM',
        enabled: true,
        specs: { some: { enabled: true } },
      },
      include: productInclude,
    })
  }

  // 查询可下单的定制商品及启用规格。
  findAvailableProduct(bouquetId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.product.findFirst({
      where: { id: bouquetId, type: 'CUSTOM', enabled: true },
      include: productInclude,
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
      include: orderInclude,
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
      include: orderInclude,
    })
  }

  // 创建或更新平台单例配置。
  saveConfig(
    create: Prisma.PlatformConfigUncheckedCreateInput,
    update: Prisma.PlatformConfigUncheckedUpdateInput,
  ) {
    return this.prisma.platformConfig.upsert({
      where: { id: 1 },
      create,
      update,
    })
  }

  // 读取定制订单详情及派送记录。
  findOrderDetail(orderNo: string) {
    return this.prisma.order.findFirst({
      where: { orderNo, type: 'CUSTOM' },
      include: {
        ...orderInclude,
        dispatches: { orderBy: { createdAt: 'asc' } },
      },
    })
  }

  // 按订单号查询定制订单。
  findOrder(orderNo: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.order.findFirst({
      where: { orderNo, type: 'CUSTOM' },
      include: orderInclude,
    })
  }

  // 按订单状态和版本更新订单，防止并发覆盖。
  updateOrder(
    orderId: number,
    version: number,
    orderStatus: OrderStatus,
    data: Prisma.OrderUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.order.updateMany({
      where: {
        id: orderId,
        type: 'CUSTOM',
        version: version,
        status: orderStatus,
      },
      data,
    })
  }

  // 记录定制订单派送信息。
  createDispatch(
    data: Prisma.OrderDispatchUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma
    return db.orderDispatch.create({
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
  getOrderById(orderId: number, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma
    return db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    })
  }
  // 在传入事务中分页查询定制订单及总数。
  async findOrderPage(query: CustomOrderQuery, tx: Prisma.TransactionClient) {
    const where = { type: 'CUSTOM' as const, status: query.status }
    return [
      await tx.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      await tx.order.count({ where }),
    ] as const
  }
}
