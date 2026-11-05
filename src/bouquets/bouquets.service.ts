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
import { allocateCoupon } from '../orders/order-lines'
import { consumeCoupon, lockCoupon, returnCoupon } from '../orders/order-coupons'
import { PaymentService } from '../payment/payment.service'
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
// 定制花束业务数据类型。
type SavedOrder = Prisma.OrderGetPayload<{
  // 关联查询配置。
  include: typeof orderInclude
}>
// 将数据库中的元金额转换为接口使用的整数分。
const cents = (value: Prisma.Decimal | number) =>
  Math.round(Number(value) * 100)

// 定制花束业务服务。
@Injectable()
export class BouquetsService {
  // 注入定制花束数据访问层及业务依赖。
  constructor(
    // 业务数据访问层。
    private readonly repo: BouquetsRepository,
    // 用户身份校验服务。
    private readonly users: UserAuthService,
    // 订单业务服务。
    private readonly orders: OrdersService,
    // 数据库访问服务。
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
  ) {}

  // 校验当前账号的定制花束访问权限。
  private authorize(
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 不满足要求时提示：仅平台管理员可管理定制业务。
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      throw new ForbiddenException('仅平台管理员可管理定制业务')
  }

  // 读取平台定制花束配置。
  private async config(
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 查询业务配置。
    const config = await this.repo.findConfig(tx)
    // 2. 不满足要求时提示：定制服务暂未开放。
    if (!config?.customEnabled)
      throw new BadRequestException('定制服务暂未开放')
    // 3. 返回本次处理结果。
    return config
  }

  // 整理定制花束展示信息。
  private output(
    // 商品信息。
    product: Prisma.ProductGetPayload<{
      // 关联查询配置。
      include: typeof productInclude
    }>,
    // 业务配置。
    config: Awaited<ReturnType<BouquetsService['config']>>,
  ) {
    // 1. 返回本次处理结果。
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
    // 1. 准备业务配置。
    const config = await this.config()
    // 2. 查询商品列表。
    const products = await this.repo.findProducts()
    // 3. 返回本次处理结果。
    return products.map((product) => this.output(product, config))
  }

  // 查询定制花束详情。
  async detail(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 准备业务配置。
    const config = await this.config()
    // 2. 查询商品信息。
    const product = await this.repo.findProductById(id)
    // 3. 不满足要求时提示：花束不存在或已下架。
    if (!product) throw new NotFoundException('花束不存在或已下架')
    // 4. 整理定制花束展示信息。
    return this.output(product, config)
  }

  // 校验配送地址、定制服务与花束规格，计算下单金额。
  private async selection(
    // 当前登录用户编号。
    userId: number,
    // 接口请求参数。
    dto: QuoteBouquetDto,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 不满足要求时提示：请填写配送地址。
    if (!dto.address.trim()) throw new BadRequestException('请填写配送地址')
    // 2. 准备业务配置。
    const config = await this.config(tx)
    // 3. 查询商品信息。
    const product = await this.repo.findAvailableProduct(dto.bouquetId, tx)
    // 4. 查询商品规格信息。
    const spec = product?.specs.find((item) => item.id === dto.specId)
    // 5. 不满足要求时提示：花束或规格已下架。
    if (!product || !spec)
      throw new BadRequestException('花束或规格已下架，请重新选择')
    // 6. 计算商品金额。
    const productAmount = cents(spec.price) * dto.quantity
    // 7. 准备配送费用。
    const deliveryFee = cents(config.deliveryFee)
    // 8. 准备订单实际应付金额。
    const payableAmount = productAmount + deliveryFee
    // 9. 不满足要求时提示：订单金额超过限制。
    if (!Number.isSafeInteger(payableAmount) || payableAmount > 999999999)
      throw new BadRequestException('订单金额超过限制，请减少数量')
    const coupon = dto.couponId ? await this.repo.findCoupon(dto.couponId, tx) : null
    if (dto.couponId && !coupon) throw new ConflictException('优惠券不存在')
    const discount = allocateCoupon(coupon, userId, [{ specId: spec.id, quantity: dto.quantity, unitPrice: cents(spec.price) }])
    // 10. 优惠只抵商品金额，配送费保留原价。
    return {
      config,
      product,
      spec,
      coupon,
      exchangeQuantity: discount.exchanges[0],
      quote: { productAmount, deliveryFee, discountAmount: discount.discountAmount, payableAmount: payableAmount - discount.discountAmount },
    }
  }

  // 校验选择的商品并返回订单报价。
  async quote(
    // 用户编号。
    userId: number,
    // 接口请求参数。
    dto: QuoteBouquetDto,
  ) {
    // 1. 校验用户状态并返回当前资料。
    await this.users.currentUser(userId)
    // 2. 返回本次处理结果。
    return (await this.selection(userId, dto)).quote
  }

  // 筛选当前用户适用于所选定制规格和数量的优惠券。
  async availableCoupons(userId: number, dto: QuoteBouquetDto) {
    await this.users.currentUser(userId)
    const { spec } = await this.selection(userId, { ...dto, couponId: undefined })
    const coupons = await this.repo.findAvailableCoupons(userId)
    return coupons.filter((coupon) => {
      try {
        allocateCoupon(coupon, userId, [{ specId: spec.id, quantity: dto.quantity, unitPrice: cents(spec.price) }])
        return true
      } catch (error) {
        if (error instanceof ConflictException) return false
        throw error
      }
    })
  }

  // 检查重复下单请求是否与原订单一致。
  private same(
    // 当前订单信息。
    order: SavedOrder,
    // 接口请求参数。
    dto: CreateBouquetOrderDto,
  ) {
    // 1. 不满足要求时提示：重复提交的内容已变化。
    if (
      order.type !== 'CUSTOM' ||
      order.storeId !== null ||
      order.method !== 'DELIVERY' ||
      (order.couponId ?? null) !== (dto.couponId ?? null) ||
      (order.serviceSnapshot as Prisma.JsonObject)?.productId !==
        dto.bouquetId ||
      order.items[0]?.specId !== dto.specId ||
      order.items[0]?.quantity !== dto.quantity ||
      order.contactName !== dto.contactName.trim() ||
      order.contactPhone !== dto.contactPhone ||
      (order.addressSnapshot as Prisma.JsonObject)?.detail !==
        dto.address.trim() ||
      (order.remark ?? '') !== (dto.remark?.trim() ?? '') ||
      cents(order.payableAmount) !== dto.expectedAmount
    )
      throw new ConflictException('重复提交的内容已变化，请重新进入结算页')
    // 2. 返回本次处理结果。
    return this.orders.serialize(order)
  }

  // 创建定制订单，保存商品和配送快照，重复请求复用原订单。
  async create(
    // 用户编号。
    userId: number,
    // 接口请求参数。
    dto: CreateBouquetOrderDto,
  ) {
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
          const { config, product, spec, quote, coupon, exchangeQuantity } = await this.selection(userId, dto, tx)
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
              // 非零订单收款后才允许派单；零元订单直接进入待派单。
              status: quote.payableAmount > 0 ? 'PENDING_PAYMENT' : 'PENDING_DISPATCH',
              paymentStatus: quote.payableAmount > 0 ? 'PENDING' : 'NOT_REQUIRED',
              ...(quote.payableAmount === 0 ? { confirmedAt: new Date() } : {}),
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
              discountAmount: quote.discountAmount / 100,
              ...(coupon ? {
                couponId: coupon.id,
                couponSnapshot: {
                  id: coupon.id, name: coupon.name, type: coupon.type, scope: coupon.scope,
                  cashAmount: coupon.cashAmount?.toString() ?? null,
                  exchangeSpecId: coupon.exchangeSpecId, exchangeQuantity: coupon.exchangeQuantity,
                  activityId: coupon.activityId, activityName: coupon.activityName, isFlowerGift: coupon.isFlowerGift,
                },
              } : {}),
              deliveryFee: quote.deliveryFee / 100,
              payableAmount: quote.payableAmount / 100,
              items: {
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
                  discountAmount: quote.discountAmount / 100,
                  exchangeQuantity,
                  giftQuantity: coupon?.isFlowerGift ? exchangeQuantity : 0,
                  giftStems: coupon?.isFlowerGift && spec.stemsPerUnit != null ? exchangeQuantity * spec.stemsPerUnit : null,
                  reimbursementPerUnit: coupon?.isFlowerGift ? coupon.reimbursementPerUnit : null,
                  reimbursementAmount: coupon?.isFlowerGift && exchangeQuantity && coupon.reimbursementPerUnit != null
                    ? coupon.reimbursementPerUnit.mul(exchangeQuantity) : null,
                },
              },
              logs: {
                create: {
                  actorType: 'USER',
                  actorId: userId,
                  action: 'CREATE',
                  toStatus: quote.payableAmount > 0 ? 'PENDING_PAYMENT' : 'PENDING_DISPATCH',
                  toPaymentStatus: quote.payableAmount > 0 ? 'PENDING' : 'NOT_REQUIRED',
                  operationKey: `create:${userId}:${dto.requestKey}`,
                  remark: quote.payableAmount > 0 ? '定制订单等待微信支付' : '零元定制订单等待派单',
                },
              },
            },
            tx,
          )
          // 非零订单先锁券，支付确认再核销；零元订单直接核销。
          if (coupon) {
            if (quote.payableAmount > 0) await lockCoupon(tx, coupon, userId, order.id)
            else await consumeCoupon(tx, coupon, userId, order.id, '零元定制订单确认用券')
          }
          return this.orders.serialize(order)
        },
      )
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // 已存在的记录。
        const prior = await this.repo.findByRequestKey(userId, dto.requestKey)
        if (prior) return this.same(prior, dto)
      }
      throw error
    }
  }

  // 校验管理权限并读取定制服务设置。
  async settings(
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 校验当前账号的定制花束访问权限。
    this.authorize(admin)
    // 2. 查询业务配置。
    const config = await this.repo.findConfig()
    // 3. 返回本次处理结果。
    return {
      customEnabled: config?.customEnabled ?? false,
      deliveryFee: cents(config?.deliveryFee ?? 0),
      businessHours: config?.businessHours ?? '',
      servicePhone: config?.servicePhone ?? '',
      deliveryStaff: config?.deliveryStaff ?? '',
    }
  }

  // 保存定制服务设置并保留其他首页配置。
  async saveSettings(
    // 接口请求参数。
    dto: BouquetSettingsDto,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 校验当前账号的定制花束访问权限。
    this.authorize(admin)
    // 2. 整理待保存或处理的数据。
    const data = {
      ...dto,
      deliveryFee: new Prisma.Decimal(dto.deliveryFee).div(100),
    }
    // 只更新独立列，保留首页 banners 等配置。
    await this.repo.saveConfig({ id: 1, ...data }, data)
    // 3. 校验管理权限并读取定制服务设置。
    return this.settings(admin)
  }

  // 查询后台可见的定制订单列表。
  async manageList(
    // 列表查询条件。
    query: CustomOrderQuery,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 校验当前账号的定制花束访问权限。
    this.authorize(admin)

    // 2. 查询当前页的数据列表、汇总总数或总金额。
    const [list, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) =>
        this.repo.findOrderPage(query, tx),
    )
    // 3. 返回本次处理结果。
    return {
      list: list.map((order) => this.orders.serialize(order)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  // 查询后台定制订单详情。
  async manageDetail(
    // 业务订单编号。
    orderNo: string,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 校验当前账号的定制花束访问权限。
    this.authorize(admin)
    // 2. 查询当前订单信息。
    const order = await this.repo.findOrderDetail(orderNo)
    // 3. 不满足要求时提示：定制订单不存在。
    if (!order) throw new NotFoundException('定制订单不存在')
    // 4. 返回本次处理结果。
    return { ...this.orders.serialize(order), dispatches: order.dispatches }
  }

  // 校验订单状态及版本，执行履约操作。
  async action(
    // 业务订单编号。
    orderNo: string,
    // 接口请求参数。
    dto: CustomOrderAction,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 校验当前账号的定制花束访问权限。
    this.authorize(admin)
    // 非零定制取消复用现有查单、关单与退款流程，网络调用在事务外。
    if (dto.action === 'cancel') {
      const order = await this.repo.findOrderDetail(orderNo)
      if (!order) throw new NotFoundException('定制订单不存在')
      if (cents(order.payableAmount) > 0 && order.paymentStatus !== 'NOT_REQUIRED') {
        await this.payments.cancel(order.userId, orderNo, false, { ...admin, version: dto.version })
        return this.manageDetail(orderNo, admin)
      }
    }
    // 2. 在事务中完成相关查询或更新。
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 当前订单信息。
      const order = await this.repo.findOrder(orderNo, tx)
      if (!order) throw new NotFoundException('定制订单不存在')
      if (order.version !== dto.version)
        throw new ConflictException('订单已变化，请刷新')
      // 允许的状态流转关系。
      const transitions: Record<
        CustomOrderAction['action'],
        {
          // 变更前的状态。
          from: OrderStatus[]
          // 变更后的状态。
          to: OrderStatus
        }
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
      // 下一步处理状态。
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
      // 本次处理结果。
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
      if (dto.action === 'cancel' && order.couponId)
        await returnCoupon(tx, order.couponId, order.userId, order.id)
      // 业务操作幂等键。
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
