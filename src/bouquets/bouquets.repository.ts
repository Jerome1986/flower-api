import { Injectable } from '@nestjs/common'
import { Prisma, type OrderStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CustomOrderQuery } from './dto/custom-order-query.dto'
// 商品关联查询配置。
export const productInclude = {
  specs: {
    where: { enabled: true },
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.ProductInclude
// 订单关联查询配置。
export const orderInclude = {
  items: { orderBy: { id: 'asc' as const } },
  logs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude
// 定制花束业务数据类型。
type SavedOrder = Prisma.OrderGetPayload<{
  // 关联查询配置。
  include: typeof orderInclude
}>
// 定制花束数据库访问。
@Injectable()
export class BouquetsRepository {
  // 注入数据库连接，集中处理定制花束数据读写。
  constructor(
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 读取平台单例配置。
  findConfig(
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.platformConfig.findUnique({ where: { id: 1 } })
  }

  // 查询启用的定制商品及有效规格。
  findProducts() {
    // 1. 按条件读取数据库记录。
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
  findProductById(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 按条件读取数据库记录。
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
  findAvailableProduct(
    // 定制花束商品编号。
    bouquetId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.product.findFirst({
      where: { id: bouquetId, type: 'CUSTOM', enabled: true },
      include: productInclude,
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
      include: orderInclude,
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
      include: orderInclude,
    })
  }

  // 创建或更新平台单例配置。
  saveConfig(
    // 新建记录的数据。
    create: Prisma.PlatformConfigUncheckedCreateInput,
    // 更新记录的数据。
    update: Prisma.PlatformConfigUncheckedUpdateInput,
  ) {
    // 1. 保存本次业务数据变更。
    return this.prisma.platformConfig.upsert({
      where: { id: 1 },
      create,
      update,
    })
  }

  // 读取定制订单详情及派送记录。
  findOrderDetail(
    // 业务订单编号。
    orderNo: string,
  ) {
    // 1. 按条件读取数据库记录。
    return this.prisma.order.findFirst({
      where: { orderNo, type: 'CUSTOM' },
      include: {
        ...orderInclude,
        dispatches: { orderBy: { createdAt: 'asc' } },
      },
    })
  }

  // 按订单号查询定制订单。
  findOrder(
    // 业务订单编号。
    orderNo: string,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.order.findFirst({
      where: { orderNo, type: 'CUSTOM' },
      include: orderInclude,
    })
  }

  // 按订单状态和版本更新订单，防止并发覆盖。
  updateOrder(
    // 订单编号。
    orderId: number,
    // 并发更新版本号。
    version: number,
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
    // 待保存或处理的数据。
    data: Prisma.OrderDispatchUncheckedCreateInput,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 保存本次业务数据变更。
    return db.orderDispatch.create({
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
  getOrderById(
    // 订单编号。
    orderId: number,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 准备当前事务或默认数据库连接。
    const db = tx ?? this.prisma
    // 2. 按条件读取数据库记录。
    return db.order.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    })
  }
  // 在传入事务中分页查询定制订单及总数。
  async findOrderPage(
    // 列表查询条件。
    query: CustomOrderQuery,
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
  ) {
    // 1. 整理数据库查询条件。
    const where = { type: 'CUSTOM' as const, status: query.status }
    // 2. 返回本次处理结果。
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
