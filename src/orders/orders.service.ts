import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { UserAuthService } from '../user-auth/user-auth.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { QuoteOrderDto } from './dto/quote-order.dto'
import { OrdersRepository, include } from './orders.repository'
import { consumeCoupon, lockCoupon, returnCoupon } from './order-coupons'
import { orderLines, allocateCoupon } from './order-lines'
import { PaymentService } from '../payment/payment.service'
// 订单业务数据类型。
type SavedOrder = Prisma.OrderGetPayload<{
  // 关联查询配置。
  include: typeof include
}>
// 将元转换为整数分。
const cents = (value: Prisma.Decimal | number) =>
  Math.round(Number(value) * 100)
// 订单业务服务。
@Injectable()
export class OrdersService {
  // 注入本模块所需的业务依赖。
  constructor(
    // 业务数据访问层。
    private readonly repo: OrdersRepository,
    // 用户身份校验服务。
    private readonly users: UserAuthService,
    // 数据库访问服务。
    private readonly prisma: PrismaService,
    // 支付与退款业务服务。
    private readonly payments: PaymentService,
  ) {}

  // 校验所选商品、门店、规格和库存。
  private async selection(
    // 接口请求参数。
    dto: QuoteOrderDto,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 规范化商品明细并准备逐项校验。
    const inputs = orderLines(dto)
    // 订单商品明细。
    const lines = [] as Array<{
      // 当前商品选择参数。
      input: (typeof inputs)[number]
      // 当前操作的目标记录。
      selected: NonNullable<
        Awaited<ReturnType<OrdersRepository['findAvailableProduct']>>
      >
      // 商品规格信息。
      spec: NonNullable<
        Awaited<ReturnType<OrdersRepository['findAvailableSpec']>>
      >
      // 商品规格库存。
      stock: NonNullable<
        Awaited<ReturnType<OrdersRepository['findAvailableProduct']>>
      >['stocks'][number]
      // 商品单价。
      unitPrice: number
      // 商品金额。
      productAmount: number
    }>
    // 2. 校验门店、商品、规格、收花方式和价格。
    for (const input of inputs) {
      // 当前商品的查询条件。
      const one = { storeId: dto.storeId, method: dto.method, ...input }
      // 当前操作的目标记录。
      const selected = await this.repo.findAvailableProduct(one, tx)
      // 商品规格信息。
      const spec = await this.repo.findAvailableSpec(one, tx)
      if (!selected || !spec)
        throw new BadRequestException('门店休息、商品已下架或规格不可用')
      if (
        !(dto.method === 'pickup'
          ? selected.pickupEnabled
          : selected.deliveryEnabled)
      )
        throw new BadRequestException('商品不支持此收花方式')
      // 商品规格库存。
      const stock = selected.stocks[0]
      if (!stock) throw new ConflictException('商品库存不可用')
      // 商品单价。
      const unitPrice = cents(spec.price)
      if (!Number.isSafeInteger(unitPrice) || unitPrice < 0)
        throw new ConflictException('商品价格异常')
      lines.push({
        input,
        selected,
        spec,
        stock,
        unitPrice,
        productAmount: unitPrice * input.quantity,
      })
    }
    // 3. 按库存记录汇总预留份数并校验可售库存。
    const reservations = new Map<
      number,
      {
        // 商品规格库存。
        stock: (typeof lines)[number]['stock']
        // 商品份数。
        quantity: number
      }
    >()
    for (const line of lines) {
      // 已存在的记录。
      const prior = reservations.get(line.stock.id)
      reservations.set(line.stock.id, {
        stock: line.stock,
        quantity: (prior?.quantity || 0) + line.input.quantity,
      })
    }
    for (const { stock, quantity } of reservations.values())
      if (stock.available < quantity)
        throw new ConflictException('库存不足，请调整购物车')
    // 4. 汇总商品金额并按门店计算一次配送费。
    const productAmount = lines.reduce(
      (sum, line) => sum + line.productAmount,
      0,
    )
    // 门店信息。
    const store = lines[0].selected.store
    // 配送费用。
    const deliveryFee = dto.method === 'delivery' ? cents(store.deliveryFee) : 0
    if (
      !Number.isSafeInteger(productAmount + deliveryFee) ||
      productAmount + deliveryFee > 999999999
    )
      throw new BadRequestException('订单金额超过上限')
    // 5. 返回商品、库存预留和基础报价。
    return {
      lines,
      reservations: [...reservations.values()].sort(
        (a, b) => a.stock.id - b.stock.id,
      ),
      store,
      productAmount,
      deliveryFee,
    }
  }
  // 计算商品、配送费和优惠后的应付金额。
  private async pricing(
    // 用户编号。
    userId: number,
    // 接口请求参数。
    dto: QuoteOrderDto,
    // 当前数据库事务。
    tx?: Prisma.TransactionClient,
  ) {
    // 1. 读取所选商品和基础报价。
    const data = await this.selection(dto, tx)
    // 2. 读取用户选中的优惠券并确认存在。
    const coupon = dto.couponId
      ? await (tx ?? this.prisma).userCoupon.findUnique({
          where: { id: dto.couponId },
        })
      : null
    if (dto.couponId && !coupon) throw new ConflictException('优惠券不存在')
    // 3. 按订单明细分配优惠和兑换份数。
    const allocation = allocateCoupon(
      coupon,
      userId,
      data.lines.map((l) => ({ ...l.input, unitPrice: l.unitPrice })),
    )
    // 4. 返回商品金额、配送费和优惠后的应付金额。
    return {
      ...data,
      coupon,
      ...allocation,
      payableAmount:
        data.productAmount + data.deliveryFee - allocation.discountAmount,
    }
  }
  // 计算订单报价。
  async quote(
    // 用户编号。
    userId: number,
    // 接口请求参数。
    dto: QuoteOrderDto,
  ) {
    // 1. 校验用户状态并返回当前资料。
    await this.users.currentUser(userId)
    // 2. 准备待保存或处理的数据。
    const data = await this.pricing(userId, dto)
    // 3. 返回本次处理结果。
    return {
      productAmount: data.productAmount,
      deliveryFee: data.deliveryFee,
      discountAmount: data.discountAmount,
      payableAmount: data.payableAmount,
      items: data.lines.map((l, i) => ({
        ...l.input,
        productName: l.selected.product.name,
        specName: l.spec.name,
        unit: l.spec.unit,
        coverImage: l.selected.product.coverImage,
        unitPrice: l.unitPrice,
        productAmount: l.productAmount,
        discountAmount: data.discounts[i],
      })),
    }
  }
  // 筛选当前订单可使用的优惠券。
  async availableCoupons(
    // 用户编号。
    userId: number,
    // 接口请求参数。
    dto: QuoteOrderDto,
  ) {
    // 1. 校验用户状态并返回当前资料。
    await this.users.currentUser(userId)
    // 2. 准备待保存或处理的数据。
    const data = await this.selection(dto)
    // 3. 查询用户可选优惠券列表。
    const coupons = await this.prisma.userCoupon.findMany({
      where: {
        userId,
        status: 'AVAILABLE',
        currentOrderId: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
    })
    // 4. 返回本次处理结果。
    return coupons.filter((coupon) => {
      try {
        allocateCoupon(
          coupon,
          userId,
          data.lines.map((l) => ({ ...l.input, unitPrice: l.unitPrice })),
        )
        return true
      } catch {
        return false
      }
    })
  }
  // 整理订单响应字段。
  serialize(
    // 当前订单信息。
    order: SavedOrder,
  ) {
    // 支付协调字段仅供内部使用，不返回给客户端。
    const { paymentLeaseToken, paymentLeaseUntil, ...publicOrder } = order
    // 1. 准备业务明细列表。
    const items = order.items.map((item) => ({
      ...item,
      unitPrice: cents(item.unitPrice),
      productAmount: cents(item.productAmount),
      discountAmount: cents(item.discountAmount),
    }))
    // 2. 返回本次处理结果。
    return {
      ...publicOrder,
      pickupCode:
        order.status === 'READY' && order.method === 'PICKUP'
          ? order.pickupCode
          : null,
      productAmount: cents(order.productAmount),
      discountAmount: cents(order.discountAmount),
      deliveryFee: cents(order.deliveryFee),
      payableAmount: cents(order.payableAmount),
      items,
      // 兼容历史单商品客户端，新客户端使用商品明细数组。
      item: items[0] ?? null,
    }
  }
  // 核对重复下单请求是否与原订单一致。
  private assertSame(
    // 当前订单信息。
    order: SavedOrder,
    // 接口请求参数。
    dto: CreateOrderDto,
  ) {
    // 1. 准备收货地址信息。
    const address = order.addressSnapshot as Prisma.JsonObject | null
    // 2. 准备订单商品明细。
    const lines = orderLines(dto)
    // 嵌套写入的返回顺序可能不同，排序后比较完整商品明细。
    const expected = lines
      .map((line) =>
        JSON.stringify([
          line.productId,
          line.specId,
          line.quantity,
          line.remark || '',
        ]),
      )
      .sort()
    // 3. 准备已保存的记录。
    const saved = order.items
      .map((item) =>
        JSON.stringify([
          item.productId ??
            (order.serviceSnapshot as Prisma.JsonObject)?.productId,
          item.specId,
          item.quantity,
          item.remark || '',
        ]),
      )
      .sort()
    // 4. 准备提交内容是否与原订单一致。
    const same = JSON.stringify(expected) === JSON.stringify(saved)
    // 5. 不满足要求时提示：重复提交的内容已变化。
    if (
      !same ||
      order.type !== 'ORDINARY' ||
      (order.couponId ?? null) !== (dto.couponId ?? null) ||
      order.storeId !== dto.storeId ||
      order.method !== (dto.method === 'pickup' ? 'PICKUP' : 'DELIVERY') ||
      order.contactName !== dto.contactName.trim() ||
      order.contactPhone !== dto.contactPhone ||
      (address?.detail ?? '') !==
        (dto.method === 'delivery' ? dto.address?.trim() || '' : '') ||
      (order.remark || '') !== (dto.remark?.trim() || '') ||
      cents(order.payableAmount) !== dto.expectedAmount
    )
      throw new ConflictException('重复提交的内容已变化，请重新进入结算页')
    // 6. 返回本次处理结果。
    return this.serialize(order)
  }
  // 创建订单记录。
  async create(
    // 用户编号。
    userId: number,
    // 接口请求参数。
    dto: CreateOrderDto,
  ) {
    // 1. 校验用户身份、商品明细和联系人信息。
    await this.users.currentUser(userId)
    orderLines(dto)
    if (!dto.contactName.trim()) throw new BadRequestException('请填写联系人')
    if (dto.method === 'delivery' && !dto.address?.trim())
      throw new BadRequestException('请填写配送地址')
    try {
      return await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // 已存在的记录。
          // 2. 在事务中按请求幂等键复用内容一致的订单。
          const prior = await this.repo.findByRequestKey(
            userId,
            dto.requestKey,
            tx,
          )
          if (prior) return this.assertSame(prior, dto)
          // 待保存或处理的数据。
          // 3. 重新核算服务端金额并与用户确认金额比较。
          const data = await this.pricing(userId, dto, tx)
          if (dto.expectedAmount !== data.payableAmount)
            throw new ConflictException('价格或配送费已变化，请刷新金额后确认')
          // 逐项处理：商品规格库存、商品份数。
          // 4. 按库存版本预留每个规格的商品数量。
          for (const { stock, quantity } of data.reservations) {
            // 条件更新的影响行数。
            const changed = await this.repo.reserveStock(
              stock.id,
              quantity,
              stock.version,
              {
                available: { decrement: quantity },
                reserved: { increment: quantity },
                version: { increment: 1 },
              },
              tx,
            )
            if (changed.count !== 1)
              throw new ConflictException('库存已变化，请重新提交')
          }
          // 用户优惠券信息、门店信息。
          const { coupon, store } = data
          // 订单是否无需支付。
          const zero = data.payableAmount === 0
          // 当前业务状态。
          const status = zero ? 'PENDING_ACCEPTANCE' : 'PENDING_PAYMENT'
          // 订单支付状态。
          const paymentStatus = zero ? 'NOT_REQUIRED' : 'PENDING'
          // 当前订单信息。
          // 5. 保存订单、商品明细和优惠券快照。
          const order = await this.repo.createOrder(
            {
              orderNo: `ORD${randomUUID().replace(/-/g, '')}`,
              userId,
              requestKey: dto.requestKey,
              type: 'ORDINARY',
              storeId: store.id,
              method: dto.method === 'pickup' ? 'PICKUP' : 'DELIVERY',
              status,
              paymentStatus,
              contactName: dto.contactName.trim(),
              contactPhone: dto.contactPhone,
              ...(dto.method === 'delivery'
                ? { addressSnapshot: { detail: dto.address!.trim() } }
                : {}),
              storeSnapshot: {
                id: store.id,
                name: store.name,
                address: store.address,
                phone: store.phone,
                hours: store.businessHours,
              },
              serviceSnapshot: {
                deliveryArea: store.deliveryArea,
                deliveryFee: data.deliveryFee,
              },
              remark: dto.remark?.trim(),
              productAmount: data.productAmount / 100,
              discountAmount: data.discountAmount / 100,
              deliveryFee: data.deliveryFee / 100,
              payableAmount: data.payableAmount / 100,
              ...(zero ? { confirmedAt: new Date() } : {}),
              expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              ...(coupon
                ? {
                    couponId: coupon.id,
                    couponSnapshot: {
                      id: coupon.id,
                      name: coupon.name,
                      type: coupon.type,
                      scope: coupon.scope,
                      cashAmount: coupon.cashAmount?.toString() ?? null,
                      exchangeSpecId: coupon.exchangeSpecId,
                      exchangeQuantity: coupon.exchangeQuantity,
                      activityId: coupon.activityId,
                      activityName: coupon.activityName,
                      isFlowerGift: coupon.isFlowerGift,
                    },
                  }
                : {}),
              items: {
                create: data.lines.map((line, i) => {
                  // 优惠券兑换份数。
                  const exchangeQuantity = data.exchanges[i]
                  // 活动赠花份数。
                  const giftQuantity = coupon?.isFlowerGift
                    ? exchangeQuantity
                    : 0
                  return {
                    productId: line.input.productId,
                    specId: line.spec.id,
                    productName: line.selected.product.name,
                    categoryName: line.selected.product.category?.name,
                    coverImage: line.selected.product.coverImage,
                    specName: line.spec.name,
                    unit: line.spec.unit,
                    unitPrice: line.spec.price,
                    quantity: line.input.quantity,
                    remark: line.input.remark,
                    stemsPerUnit: line.spec.stemsPerUnit,
                    productAmount: line.productAmount / 100,
                    discountAmount: data.discounts[i] / 100,
                    exchangeQuantity,
                    giftQuantity,
                    giftStems:
                      giftQuantity && line.spec.stemsPerUnit != null
                        ? giftQuantity * line.spec.stemsPerUnit
                        : null,
                    reimbursementPerUnit: giftQuantity
                      ? coupon?.reimbursementPerUnit
                      : null,
                    reimbursementAmount:
                      giftQuantity && coupon?.reimbursementPerUnit != null
                        ? coupon.reimbursementPerUnit.mul(giftQuantity)
                        : null,
                  }
                }),
              },
              logs: {
                create: {
                  actorType: 'USER',
                  actorId: userId,
                  action: 'CREATE',
                  toStatus: status,
                  toPaymentStatus: paymentStatus,
                  operationKey: `create:${userId}:${dto.requestKey}`,
                  remark: zero
                    ? '零元订单已确认，等待门店接单'
                    : '订单已创建，等待支付',
                },
              },
            },
            tx,
          )
          // 6. 零元订单直接核销券，其余订单先锁定优惠券。
          if (coupon) {
            if (zero) await consumeCoupon(tx, coupon, userId, order.id)
            else await lockCoupon(tx, coupon, userId, order.id)
          }
          // 逐项处理：商品规格库存、商品份数。
          for (const { stock, quantity } of data.reservations)
            // 7. 记录库存预留流水，供取消和履约使用。
            await this.repo.createInventoryLog(
              {
                stockId: stock.id,
                orderId: order.id,
                type: 'RESERVE',
                availableBefore: stock.available,
                availableAfter: stock.available - quantity,
                reservedBefore: stock.reserved,
                reservedAfter: stock.reserved + quantity,
                reason: '订单创建预留库存',
                operationKey: `reserve:${order.id}:${stock.id}`,
              },
              tx,
            )
          return this.serialize(order)
        },
      )
    } catch (error) {
      if (
        error instanceof ConflictException ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002')
      ) {
        // 已存在的记录。
        const prior = await this.repo.findByRequestKey(userId, dto.requestKey)
        if (prior) return this.assertSame(prior, dto)
      }
      throw error
    }
  }
  // 查询订单列表。
  async list(
    // 用户编号。
    userId: number,
  ) {
    // 1. 校验用户状态并返回当前资料。
    await this.users.currentUser(userId)
    // 2. 返回本次处理结果。
    return (await this.repo.findByUserId(userId)).map((order) =>
      this.serialize(order),
    )
  }
  // 查询订单详情。
  async detail(
    // 用户编号。
    userId: number,
    // 业务订单编号。
    orderNo: string,
  ) {
    // 1. 校验用户身份并只读取本人订单。
    await this.users.currentUser(userId)
    // 当前订单信息。
    const order = await this.repo.findUserOrder(userId, orderNo)
    if (!order) throw new NotFoundException('订单不存在')
    // 2. 待支付订单尝试限频查单，并返回最新状态。
    if (order.paymentStatus === 'PENDING') {
      try {
        await this.payments.sync(order.id, true)
      } catch {
        /* 查单异常交由定时任务重试，详情仍可读取。 */
      }
      return this.serialize(await this.repo.getById(order.id))
    }
    // 3. 整理订单金额和可见字段后返回。
    return this.serialize(order)
  }
  // 按付款状态取消订单并处理库存和退款。
  async cancel(
    // 用户编号。
    userId: number,
    // 业务订单编号。
    orderNo: string,
    // 是否由超时关闭触发。
    expired = false,
    // 发起操作的管理员或店长。
    operator?: {
      // 记录编号。
      id: number
      // 账号角色。
      role: string
      // 并发更新版本号。
      version?: number
    },
  ) {
    // 1. 根据当前条件选择处理分支。
    if (!expired && !operator) await this.users.currentUser(userId)
    // 2. 查询当前操作的目标记录。
    const selected = await this.repo.findUserOrder(userId, orderNo)
    // 3. 不满足要求时提示：订单不存在。
    if (!selected) throw new NotFoundException('订单不存在')
    // 4. 满足条件时提前结束本次处理。
    if (selected.type === 'ORDINARY' && cents(selected.payableAmount) > 0)
      return this.serialize(
        await this.payments.cancel(userId, orderNo, expired, operator),
      )
    // 5. 在事务中完成相关查询或更新。
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 当前订单信息。
      const order = await this.repo.findUserOrder(userId, orderNo, tx)
      if (!order) throw new NotFoundException('订单不存在')
      if (['CANCELLED', 'CLOSED'].includes(order.status))
        return this.serialize(order)
      if (operator?.version !== undefined && operator.version !== order.version)
        throw new ConflictException('订单已变化，请刷新')
      // 允许的业务状态。
      const allowed = expired
        ? ['PENDING_PAYMENT']
        : order.type === 'CUSTOM'
          ? ['PENDING_DISPATCH']
          : operator
            ? ['PENDING_PAYMENT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'READY']
            : ['PENDING_PAYMENT', 'PENDING_ACCEPTANCE']
      if (
        !allowed.includes(order.status) ||
        (expired && order.expiresAt > new Date())
      )
        throw new ConflictException('当前订单不能取消或关闭')
      // 条件更新的影响行数。
      const changed = await this.repo.cancelOrder(
        order.id,
        order.status,
        order.version,
        {
          status: expired ? 'CLOSED' : 'CANCELLED',
          paymentStatus: 'CLOSED',
          version: { increment: 1 },
          ...(expired ? { closedAt: new Date() } : { cancelledAt: new Date() }),
          cancelReason: expired ? '订单超时关闭' : '用户取消订单',
        },
        tx,
      )
      if (changed.count !== 1)
        throw new ConflictException('订单状态已变化，请刷新')
      if (order.couponId)
        await returnCoupon(tx, order.couponId, userId, order.id)
      if (order.type === 'ORDINARY') {
        // 订单库存预留流水。
        const reservations = await this.repo.findReservations(order.id, tx)
        if (!reservations.length || !order.items.length)
          throw new ConflictException('订单库存预留记录缺失')
        // 逐项处理：当前库存预留流水。
        for (const reservation of reservations) {
          // 商品份数。
          const quantity =
            reservation.reservedAfter - reservation.reservedBefore
          // 商品规格库存。
          const stock = await this.repo.getStock(reservation.stockId, tx)
          // 库存释放结果。
          const released = await this.repo.releaseStock(
            stock.id,
            stock.version,
            quantity,
            {
              available: { increment: quantity },
              reserved: { decrement: quantity },
              version: { increment: 1 },
            },
            tx,
          )
          if (released.count !== 1)
            throw new ConflictException('库存已变化，请重试')
          await this.repo.createInventoryLog(
            {
              stockId: stock.id,
              orderId: order.id,
              type: 'RELEASE',
              availableBefore: stock.available,
              availableAfter: stock.available + quantity,
              reservedBefore: stock.reserved,
              reservedAfter: stock.reserved - quantity,
              reason: expired ? '订单超时释放库存' : '取消订单释放库存',
              operationKey: `release:${order.id}:${stock.id}`,
            },
            tx,
          )
        }
      }
      await this.repo.createOrderLog(
        {
          orderId: order.id,
          actorType: expired
            ? 'SYSTEM'
            : operator
              ? operator.role === 'STORE_MANAGER'
                ? 'MANAGER'
                : 'ADMIN'
              : 'USER',
          actorId: expired ? null : (operator?.id ?? userId),
          action: expired ? 'EXPIRE' : 'CANCEL',
          fromStatus: order.status,
          toStatus: expired ? 'CLOSED' : 'CANCELLED',
          fromPaymentStatus: order.paymentStatus,
          toPaymentStatus: 'CLOSED',
          operationKey: `cancel:${order.id}`,
        },
        tx,
      )
      return this.serialize(await this.repo.getById(order.id, tx))
    })
  }
  // 关闭超时未支付订单并释放预留资源。
  @Interval(60000)
  async closeExpired() {
    // 1. 逐项处理当前业务记录。
    for (const order of await this.repo.findExpiredOrders()) {
      try {
        await this.cancel(order.userId, order.orderNo, true)
      } catch {
        /* 并发冲突由下一轮定时任务重试。 */
      }
    }
  }
}
