import { PrismaService } from '../prisma/prisma.service'
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrderStatus, Prisma } from '@prisma/client'
import { randomInt } from 'node:crypto'
import { type CurrentAdmin } from '../common/guards/admin-auth.guard'
import type { StoreAccess } from '../common/types/store-access'
import { OrderAction } from './dto/order-action.dto'
import { OrderQuery } from './dto/order-query.dto'
import { ManageOrdersRepository } from './manage-orders.repository'
import { OrdersService } from './orders.service'

import { include } from './manage-orders.repository'
export { include } from './manage-orders.repository'

// 订单业务服务。
@Injectable()
export class ManageOrdersService {
  // 注入订单数据访问层及业务依赖。
  constructor(
    // 业务数据访问层。
    private readonly repo: ManageOrdersRepository,
    // 订单业务服务。
    private readonly orders: OrdersService,
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 根据账号身份限定订单查询范围。
  private scope(
    // 当前管理员信息。
    admin: CurrentAdmin,
  ): StoreAccess {
    // 1. 满足条件时提前结束本次处理。
    if (['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role)) return {}
    // 2. 满足条件时提前结束本次处理。
    if (admin.role === 'STORE_MANAGER') return { managerId: admin.id }
    // 3. 满足条件时提前结束本次处理。
    if (admin.role === 'STORE_ADMIN' && admin.storeId)
      return { storeId: admin.storeId }
    throw new ForbiddenException('无订单管理权限')
  }

  // 查询当前可访问的门店。
  async stores(
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 根据账号身份限定订单查询范围。
    this.scope(admin)
    // 2. 返回本次处理结果。
    return this.repo.findStores(admin)
  }

  // 整理订单响应字段。
  private serialize(
    // 当前订单信息。
    order: Prisma.OrderGetPayload<{
      // 关联查询配置。
      include: typeof include
    }>,
  ) {
    // 店员核验客户出示的码，管理接口不泄露用户取货码。
    return { ...this.orders.serialize(order), pickupCode: null }
  }

  // 查询订单列表。
  async list(
    // 列表查询条件。
    query: OrderQuery,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 查询当前页的数据列表、汇总总数或总金额。
    const [list, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) =>
        this.repo.findPage(this.scope(admin), query, tx),
    )
    // 2. 返回本次处理结果。
    return {
      list: list.map((item) => this.serialize(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  // 按订单号和管理员可见范围查询订单。
  private async selected(
    // 业务订单或交易编号。
    no: string,
    // 当前管理员信息。
    admin: CurrentAdmin,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 查询当前订单信息。
    const order = await this.repo.findOrder(no, this.scope(admin), tx)
    // 2. 不满足要求时提示：订单不存在或无访问权限。
    if (!order) throw new NotFoundException('订单不存在或无访问权限')
    // 3. 返回本次处理结果。
    return order
  }

  // 查询订单详情。
  async detail(
    // 业务订单或交易编号。
    no: string,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 整理订单响应字段。
    return this.serialize(await this.selected(no, admin))
  }

  // 校验订单状态及版本，执行履约操作。
  async action(
    // 业务订单或交易编号。
    no: string,
    // 接口请求参数。
    dto: OrderAction,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 取消操作复用订单服务的状态校验和库存释放流程。
    if (dto.action === 'cancel') {
      // 当前订单信息。
      const order = await this.selected(no, admin)
      if (
        order.status !== 'CANCELLED' &&
        order.status !== 'CLOSED' &&
        dto.version !== order.version
      )
        throw new ConflictException('订单已变化，请刷新')
      return {
        ...(await this.orders.cancel(order.userId, no, false, {
          ...admin,
          version: dto.version,
        })),
        pickupCode: null,
      }
    }
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 2. 在可见门店范围内读取订单，校验操作幂等键及编辑版本。
      const order = await this.selected(no, admin, tx)
      // 分组或配置索引键。
      const key = `manage:${order.id}:${dto.action}`
      if (order.logs.some((log) => log.operationKey === key))
        return this.serialize(order)
      if (order.version !== dto.version)
        throw new ConflictException('订单已变化，请刷新')
      // 当前业务状态。
      let status: OrderStatus
      // 待保存或处理的数据。
      const data: Prisma.OrderUncheckedUpdateManyInput = {
        version: { increment: 1 },
      }
      if (!['PAID', 'NOT_REQUIRED'].includes(order.paymentStatus))
        throw new ConflictException('订单尚未支付')
      if (dto.action === 'accept' && order.status === 'PENDING_ACCEPTANCE') {
        status = 'ACCEPTED'
        data.acceptedAt = new Date()
      } else if (dto.action === 'ready' && order.status === 'ACCEPTED') {
        status = 'READY'
        data.readyAt = new Date()
        if (order.method === 'PICKUP')
          data.pickupCode = String(randomInt(100000, 1000000))
      } else if (
        dto.action === 'deliver' &&
        order.status === 'READY' &&
        order.method === 'DELIVERY'
      ) {
        status = 'DELIVERING'
        data.deliveringAt = new Date()
      } else if (
        dto.action === 'complete' &&
        ((order.status === 'READY' && order.method === 'PICKUP') ||
          (order.status === 'DELIVERING' && order.method === 'DELIVERY'))
      ) {
        if (
          order.method === 'PICKUP' &&
          (!dto.pickupCode || dto.pickupCode !== order.pickupCode)
        )
          throw new ConflictException('取货码不正确')
        status = 'COMPLETED'
        data.completedAt = new Date()
        data.fulfilledStoreId = order.storeId
        if (admin.role !== 'STORE_MANAGER') data.completedById = admin.id
      } else throw new ConflictException('当前状态不能执行此操作')
      data.status = status
      // 3. 按原版本和状态提交履约变更，并发修改时整体回滚。
      const changed = await this.repo.updateOrder(
        order.id,
        order.version,
        order.status,
        data,
        tx,
      )
      if (changed.count !== 1)
        throw new ConflictException('订单状态已变化，请刷新')
      // 4. 完成订单时消耗预留库存，并保存不可重复的库存流水。
      if (status === 'COMPLETED') {
        // 订单库存预留流水。
        const reservations = await this.repo.findReservations(order.id, tx)
        if (!reservations.length || !order.items.length)
          throw new ConflictException('订单库存预留记录缺失')
        // 逐项处理：当前库存预留流水。
        for (const reservation of reservations) {
          // 商品规格库存。
          const stock = await this.repo.getStock(reservation.stockId, tx)
          // 商品份数。
          const quantity =
            reservation.reservedAfter - reservation.reservedBefore
          // 库存扣减结果。
          const consumed = await this.repo.consumeStock(
            stock.id,
            stock.version,
            quantity,
            {
              reserved: { decrement: quantity },
              version: { increment: 1 },
            },
            tx,
          )
          if (consumed.count !== 1)
            throw new ConflictException('库存已变化，请重试')
          await this.repo.createInventoryLog(
            {
              stockId: stock.id,
              orderId: order.id,
              type: 'CONSUME',
              availableBefore: stock.available,
              availableAfter: stock.available,
              reservedBefore: stock.reserved,
              reservedAfter: stock.reserved - quantity,
              reason: '订单完成消耗预留库存',
              operationKey: `consume:${order.id}:${stock.id}`,
            },
            tx,
          )
        }
      }
      // 5. 保存操作者及状态变化日志，与订单和库存一同提交。
      await this.repo.createOrderLog(
        {
          orderId: order.id,
          actorType: admin.role === 'STORE_MANAGER' ? 'MANAGER' : 'ADMIN',
          actorId: admin.id,
          action: dto.action,
          fromStatus: order.status,
          toStatus: status,
          fromPaymentStatus: order.paymentStatus,
          toPaymentStatus: order.paymentStatus,
          operationKey: key,
          remark: null,
        },
        tx,
      )
      return this.serialize(await this.repo.getById(order.id, tx))
    })
  }
}
