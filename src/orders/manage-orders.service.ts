import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { type CurrentAdmin } from '../common/guards/admin-auth.guard';
import { OrderAction } from './dto/order-action.dto';
import { OrderQuery } from './dto/order-query.dto';
import { ManageOrdersRepository } from './manage-orders.repository';
import { OrdersService } from './orders.service';

export const include = {
  item: true,
  logs: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class ManageOrdersService {
  // 注入订单数据访问层及业务依赖。
  constructor(
    private readonly repo: ManageOrdersRepository,
    private readonly orders: OrdersService,
  ) {}

  // 根据账号身份限定订单查询范围。
  private scope(admin: CurrentAdmin): Prisma.OrderWhereInput {
    if (['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      return { type: 'ORDINARY' };
    if (admin.role === 'STORE_MANAGER')
      return { type: 'ORDINARY', store: { managerId: admin.id } };
    if (admin.role === 'STORE_ADMIN' && admin.storeId)
      return { type: 'ORDINARY', storeId: admin.storeId };
    throw new ForbiddenException('无订单管理权限');
  }

  // 查询当前可访问的门店。
  async stores(admin: CurrentAdmin) {
    this.scope(admin);
    return this.repo.findManyStore({
      where:
        admin.role === 'STORE_MANAGER'
          ? { managerId: admin.id }
          : admin.role === 'STORE_ADMIN'
            ? { id: admin.storeId! }
            : {},
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  // 整理订单响应字段。
  private serialize(
    order: Prisma.OrderGetPayload<{ include: typeof include }>,
  ) {
    // 店员核验客户出示的码，管理接口不泄露用户取货码。
    return { ...this.orders.serialize(order), pickupCode: null };
  }

  // 查询订单列表。
  async list(query: OrderQuery, admin: CurrentAdmin) {
    const groups: Record<string, OrderStatus[]> = {
      unpaid: ['PENDING_PAYMENT'],
      pending: ['PENDING_ACCEPTANCE'],
      preparing: ['ACCEPTED'],
      ready: ['READY'],
      delivering: ['DELIVERING'],
      completed: ['COMPLETED'],
      cancelled: ['CANCELLED', 'CLOSED'],
    };
    const where: Prisma.OrderWhereInput = {
      AND: [
        this.scope(admin),
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
    };
    const [list, total] = await this.repo.transaction([
      this.repo.findManyOrder({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.repo.countOrder({ where }),
    ]);
    return {
      list: list.map((item) => this.serialize(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // 按订单号和管理员可见范围查询订单。
  private async selected(
    no: string,
    admin: CurrentAdmin,
    db?: Prisma.TransactionClient,
  ) {
    const order = await this.repo.findFirstOrder(
      {
        where: { AND: [{ orderNo: no }, this.scope(admin)] },
        include,
      },
      db,
    );
    if (!order) throw new NotFoundException('订单不存在或无访问权限');
    return order;
  }

  // 查询订单详情。
  async detail(no: string, admin: CurrentAdmin) {
    return this.serialize(await this.selected(no, admin));
  }

  // 校验订单状态及版本，执行履约操作。
  async action(no: string, dto: OrderAction, admin: CurrentAdmin) {
    // 1. 取消操作复用订单服务的状态校验和库存释放流程。
    if (dto.action === 'cancel') {
      const order = await this.selected(no, admin);
      if (
        order.status !== 'CANCELLED' &&
        order.status !== 'CLOSED' &&
        dto.version !== order.version
      )
        throw new ConflictException('订单已变化，请刷新');
      return {
        ...(await this.orders.cancel(order.userId, no, false, {
          ...admin,
          version: dto.version,
        })),
        pickupCode: null,
      };
    }
    return this.repo.transaction(async (tx) => {
      // 2. 在可见门店范围内读取订单，校验操作幂等键及编辑版本。
      const order = await this.selected(no, admin, tx);
      const key = `manage:${order.id}:${dto.action}`;
      if (order.logs.some((log) => log.operationKey === key))
        return this.serialize(order);
      if (order.version !== dto.version)
        throw new ConflictException('订单已变化，请刷新');
      let status: OrderStatus;
      const data: Prisma.OrderUncheckedUpdateManyInput = {
        version: { increment: 1 },
      };
      if (!['PAID', 'NOT_REQUIRED'].includes(order.paymentStatus))
        throw new ConflictException('订单尚未支付');
      if (dto.action === 'accept' && order.status === 'PENDING_ACCEPTANCE') {
        status = 'ACCEPTED';
        data.acceptedAt = new Date();
      } else if (dto.action === 'ready' && order.status === 'ACCEPTED') {
        status = 'READY';
        data.readyAt = new Date();
        if (order.method === 'PICKUP')
          data.pickupCode = String(randomInt(100000, 1000000));
      } else if (
        dto.action === 'deliver' &&
        order.status === 'READY' &&
        order.method === 'DELIVERY'
      ) {
        status = 'DELIVERING';
        data.deliveringAt = new Date();
      } else if (
        dto.action === 'complete' &&
        ((order.status === 'READY' && order.method === 'PICKUP') ||
          (order.status === 'DELIVERING' && order.method === 'DELIVERY'))
      ) {
        if (
          order.method === 'PICKUP' &&
          (!dto.pickupCode || dto.pickupCode !== order.pickupCode)
        )
          throw new ConflictException('取货码不正确');
        status = 'COMPLETED';
        data.completedAt = new Date();
        data.fulfilledStoreId = order.storeId;
        if (admin.role !== 'STORE_MANAGER') data.completedById = admin.id;
      } else throw new ConflictException('当前状态不能执行此操作');
      data.status = status;
      // 3. 按原版本和状态提交履约变更，并发修改时整体回滚。
      const changed = await this.repo.updateManyOrder(
        {
          where: { id: order.id, version: order.version, status: order.status },
          data,
        },
        tx,
      );
      if (changed.count !== 1)
        throw new ConflictException('订单状态已变化，请刷新');
      // 4. 完成订单时消耗预留库存，并保存不可重复的库存流水。
      if (status === 'COMPLETED') {
        const reservation = await this.repo.findUniqueInventoryLog(
          {
            where: { operationKey: `reserve:${order.id}` },
          },
          tx,
        );
        if (!reservation || !order.item)
          throw new ConflictException('订单库存预留记录缺失');
        const stock = await this.repo.findUniqueOrThrowStoreStock(
          {
            where: { id: reservation.stockId },
          },
          tx,
        );
        const quantity = order.item.quantity;
        const consumed = await this.repo.updateManyStoreStock(
          {
            where: {
              id: stock.id,
              version: stock.version,
              reserved: { gte: quantity },
            },
            data: {
              reserved: { decrement: quantity },
              version: { increment: 1 },
            },
          },
          tx,
        );
        if (consumed.count !== 1)
          throw new ConflictException('库存已变化，请重试');
        await this.repo.createInventoryLog(
          {
            data: {
              stockId: stock.id,
              orderId: order.id,
              type: 'CONSUME',
              availableBefore: stock.available,
              availableAfter: stock.available,
              reservedBefore: stock.reserved,
              reservedAfter: stock.reserved - quantity,
              reason: '订单完成消耗预留库存',
              operationKey: `consume:${order.id}`,
            },
          },
          tx,
        );
      }
      // 5. 保存操作者及状态变化日志，与订单和库存一同提交。
      await this.repo.createOrderLog(
        {
          data: {
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
        },
        tx,
      );
      return this.serialize(
        await this.repo.findUniqueOrThrowOrder(
          { where: { id: order.id }, include },
          tx,
        ),
      );
    });
  }
}
