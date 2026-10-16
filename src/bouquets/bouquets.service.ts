import { PrismaService } from '../prisma/prisma.service'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, type OrderStatus } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type { CurrentAdmin } from '../common/guards/admin-auth.guard'
import { OrdersService } from '../orders/orders.service'
import { UserAuthService } from '../user-auth/user-auth.service'
import { BouquetsRepository } from './bouquets.repository'
import { BouquetSettingsDto } from './dto/bouquet-settings.dto'
import { CreateBouquetOrderDto } from './dto/create-bouquet-order.dto'
import { CustomOrderAction } from './dto/custom-order-action.dto'
import { CustomOrderQuery } from './dto/custom-order-query.dto'
import { QuoteBouquetDto } from './dto/quote-bouquet.dto'

import { orderInclude, productInclude } from './bouquets.repository'
type SavedOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>
// 将数据库中的元金额转换为接口使用的整数分。
const cents = (value: Prisma.Decimal | number) =>
  Math.round(Number(value) * 100)

@Injectable()
export class BouquetsService {
  // 注入定制花束数据访问层及业务依赖。
  constructor(
    private readonly repo: BouquetsRepository,
    private readonly users: UserAuthService,
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  // 校验当前账号的定制花束访问权限。
  private authorize(admin: CurrentAdmin) {
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      throw new ForbiddenException('仅平台管理员可管理定制业务')
  }

  // 读取平台定制花束配置。
  private async config(tx?: Prisma.TransactionClient) {
    const config = await this.repo.findConfig(tx)
    if (!config?.customEnabled)
      throw new BadRequestException('定制服务暂未开放')
    return config
  }

  // 整理定制花束展示信息。
  private output(
    product: Prisma.ProductGetPayload<{ include: typeof productInclude }>,
    config: Awaited<ReturnType<BouquetsService['config']>>,
  ) {
    return {
      id: product.id,
      name: product.name,
      coverImage: product.coverImage,
      images: Array.isArray(product.images)
        ? product.images.filter(
            (item): item is string => typeof item === 'string',
          )
        : [],
      description: product.description ?? '',
      deliveryFee: cents(config.deliveryFee),
      businessHours: config.businessHours ?? '',
      servicePhone: config.servicePhone ?? '',
      // 每笔数量校验上限，不是库存或每日限单；定制订单不扣门店库存。
      maxQuantity: 999,
      specs: product.specs.map((spec) => ({
        id: spec.id,
        name: spec.name,
        unit: spec.unit,
        price: cents(spec.price),
      })),
    }
  }

  // 查询定制花束列表。
  async list() {
    const config = await this.config()
    const products = await this.repo.findProducts()
    return products.map((product) => this.output(product, config))
  }

  // 查询定制花束详情。
  async detail(id: number) {
    const config = await this.config()
    const product = await this.repo.findProductById(id)
    if (!product) throw new NotFoundException('花束不存在或已下架')
    return this.output(product, config)
  }

  // 校验配送地址、定制服务与花束规格，计算下单金额。
  private async selection(dto: QuoteBouquetDto, tx?: Prisma.TransactionClient) {
    if (!dto.address.trim()) throw new BadRequestException('请填写配送地址')
    const config = await this.config(tx)
    const product = await this.repo.findAvailableProduct(dto.bouquetId, tx)
    const spec = product?.specs.find((item) => item.id === dto.specId)
    if (!product || !spec)
      throw new BadRequestException('花束或规格已下架，请重新选择')
    const productAmount = cents(spec.price) * dto.quantity
    const deliveryFee = cents(config.deliveryFee)
    const payableAmount = productAmount + deliveryFee
    if (!Number.isSafeInteger(payableAmount) || payableAmount > 999999999)
      throw new BadRequestException('订单金额超过限制，请减少数量')
    return {
      config,
      product,
      spec,
      quote: { productAmount, deliveryFee, discountAmount: 0, payableAmount },
    }
  }

  // 校验选择的商品并返回订单报价。
  async quote(userId: number, dto: QuoteBouquetDto) {
    await this.users.currentUser(userId)
    return (await this.selection(dto)).quote
  }

  // 检查重复下单请求是否与原订单一致。
  private same(order: SavedOrder, dto: CreateBouquetOrderDto) {
    if (
      order.type !== 'CUSTOM' ||
      order.storeId !== null ||
      order.method !== 'DELIVERY' ||
      (order.serviceSnapshot as Prisma.JsonObject)?.productId !==
        dto.bouquetId ||
      order.item?.specId !== dto.specId ||
      order.item?.quantity !== dto.quantity ||
      order.contactName !== dto.contactName.trim() ||
      order.contactPhone !== dto.contactPhone ||
      (order.addressSnapshot as Prisma.JsonObject)?.detail !==
        dto.address.trim() ||
      (order.remark ?? '') !== (dto.remark?.trim() ?? '') ||
      cents(order.payableAmount) !== dto.expectedAmount
    )
      throw new ConflictException('重复提交的内容已变化，请重新进入结算页')
    return this.orders.serialize(order)
  }

  // 创建定制订单，保存商品和配送快照，重复请求复用原订单。
  async create(userId: number, dto: CreateBouquetOrderDto) {
    // 1. 校验用户身份和联系人，定制订单不占用门店库存。
    await this.users.currentUser(userId)
    if (!dto.contactName.trim()) throw new BadRequestException('请填写联系人')
    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // 2. 按用户和请求键复用订单，避免重复提交生成多笔订单。
          const prior = await this.repo.findByRequestKey(
            userId,
            dto.requestKey,
            tx,
          )
          if (prior) return this.same(prior, dto)
          // 3. 在事务内重新报价，拒绝价格或配送费已变化的请求。
          const { config, product, spec, quote } = await this.selection(dto, tx)
          if (dto.expectedAmount !== quote.payableAmount)
            throw new ConflictException('价格或配送费已变化，请重新报价')
          // 4. 保存商品、配送配置和联系人快照，供后续派单和履约使用。
          const order = await this.repo.createOrder(
            {
              orderNo: `CUS${randomUUID().replace(/-/g, '')}`,
              userId,
              requestKey: dto.requestKey,
              type: 'CUSTOM',
              storeId: null,
              method: 'DELIVERY',
              // 与现有普通订单相同的测试下单模式；没有收款，也不标记 PAID。
              status: 'PENDING_DISPATCH',
              paymentStatus: 'NOT_REQUIRED',
              expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              contactName: dto.contactName.trim(),
              contactPhone: dto.contactPhone,
              addressSnapshot: { detail: dto.address.trim() },
              remark: dto.remark?.trim(),
              serviceSnapshot: {
                productId: product.id,
                deliveryFee: quote.deliveryFee,
                servicePhone: config.servicePhone,
                businessHours: config.businessHours,
              },
              productAmount: quote.productAmount / 100,
              deliveryFee: quote.deliveryFee / 100,
              payableAmount: quote.payableAmount / 100,
              item: {
                create: {
                  specId: spec.id,
                  productName: product.name,
                  coverImage: product.coverImage,
                  specName: spec.name,
                  unit: spec.unit,
                  unitPrice: spec.price,
                  quantity: dto.quantity,
                  stemsPerUnit: spec.stemsPerUnit,
                  productAmount: quote.productAmount / 100,
                },
              },
              logs: {
                create: {
                  actorType: 'USER',
                  actorId: userId,
                  action: 'CREATE',
                  toStatus: 'PENDING_DISPATCH',
                  toPaymentStatus: 'NOT_REQUIRED',
                  operationKey: `create:${userId}:${dto.requestKey}`,
                  remark: '测试订单已创建，等待平台派单；支付待接入',
                },
              },
            },
            tx,
          )
          return this.orders.serialize(order)
        },
      )
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const prior = await this.repo.findByRequestKey(userId, dto.requestKey)
        if (prior) return this.same(prior, dto)
      }
      throw error
    }
  }

  // 校验管理权限并读取定制服务设置。
  async settings(admin: CurrentAdmin) {
    this.authorize(admin)
    const config = await this.repo.findConfig()
    return {
      customEnabled: config?.customEnabled ?? false,
      deliveryFee: cents(config?.deliveryFee ?? 0),
      businessHours: config?.businessHours ?? '',
      servicePhone: config?.servicePhone ?? '',
      deliveryStaff: config?.deliveryStaff ?? '',
    }
  }

  // 保存定制服务设置并保留其他首页配置。
  async saveSettings(dto: BouquetSettingsDto, admin: CurrentAdmin) {
    this.authorize(admin)
    const data = {
      ...dto,
      deliveryFee: new Prisma.Decimal(dto.deliveryFee).div(100),
    }
    // 只更新独立列，保留首页 banners 等配置。
    await this.repo.saveConfig({ id: 1, ...data }, data)
    return this.settings(admin)
  }

  // 查询后台可见的定制订单列表。
  async manageList(query: CustomOrderQuery, admin: CurrentAdmin) {
    this.authorize(admin)

    const [list, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) =>
        this.repo.findOrderPage(query, tx),
    )
    return {
      list: list.map((order) => this.orders.serialize(order)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  // 查询后台定制订单详情。
  async manageDetail(orderNo: string, admin: CurrentAdmin) {
    this.authorize(admin)
    const order = await this.repo.findOrderDetail(orderNo)
    if (!order) throw new NotFoundException('定制订单不存在')
    return { ...this.orders.serialize(order), dispatches: order.dispatches }
  }

  // 校验订单状态及版本，执行履约操作。
  async action(orderNo: string, dto: CustomOrderAction, admin: CurrentAdmin) {
    this.authorize(admin)
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await this.repo.findOrder(orderNo, tx)
      if (!order) throw new NotFoundException('定制订单不存在')
      if (order.version !== dto.version)
        throw new ConflictException('订单已变化，请刷新')
      const transitions: Record<
        CustomOrderAction['action'],
        { from: OrderStatus[]; to: OrderStatus }
      > = {
        dispatch: {
          from: ['PENDING_DISPATCH', 'DISPATCHED'],
          to: 'DISPATCHED' as const,
        },
        deliver: { from: ['DISPATCHED'], to: 'DELIVERING' as const },
        complete: { from: ['DELIVERING'], to: 'COMPLETED' as const },
        cancel: {
          from: ['PENDING_DISPATCH', 'DISPATCHED'],
          to: 'CANCELLED' as const,
        },
      }
      const next = transitions[dto.action]
      if (!next || !next.from.includes(order.status))
        throw new ConflictException('当前状态不能执行此操作')
      if (dto.action === 'cancel' && order.paymentStatus === 'PAID')
        throw new ConflictException('已付款订单需走退款流程')
      if (
        dto.action === 'dispatch' &&
        (!dto.partnerName?.trim() || !dto.partnerPhone?.trim())
      )
        throw new BadRequestException('请填写合作方名称和电话')
      const result = await this.repo.updateOrder(
        order.id,
        dto.version,
        order.status,
        {
          status: next.to,
          version: { increment: 1 },
          ...(next.to === 'COMPLETED' ? { completedAt: new Date() } : {}),
          ...(next.to === 'CANCELLED'
            ? {
                cancelledAt: new Date(),
                paymentStatus: 'CLOSED',
                cancelReason: dto.remark?.trim() || '平台取消订单',
              }
            : {}),
        },
        tx,
      )
      if (result.count !== 1) throw new ConflictException('订单已变化，请刷新')
      const operationKey = `custom:${order.id}:${dto.version}:${dto.action}`
      if (dto.action === 'dispatch')
        await this.repo.createDispatch(
          {
            orderId: order.id,
            partnerName: dto.partnerName!.trim(),
            partnerPhone: dto.partnerPhone!.trim(),
            adminId: admin.id,
            remark: dto.remark?.trim(),
            operationKey,
          },
          tx,
        )
      await this.repo.createOrderLog(
        {
          orderId: order.id,
          actorType: 'ADMIN',
          actorId: admin.id,
          action: dto.action,
          fromStatus: order.status,
          toStatus: next.to,
          fromPaymentStatus: order.paymentStatus,
          toPaymentStatus:
            next.to === 'CANCELLED' ? 'CLOSED' : order.paymentStatus,
          operationKey,
          remark: dto.remark?.trim(),
        },
        tx,
      )
      return this.orders.serialize(await this.repo.getOrderById(order.id, tx))
    })
  }
}
