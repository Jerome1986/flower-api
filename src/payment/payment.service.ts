import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { Order, Payment, Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { OrdersRepository } from '../orders/orders.repository'
import { returnCoupon } from '../orders/order-coupons'
import {
  WechatPayClient,
  WxApiError,
  WxRefund,
  WxTransaction,
} from './wechat-pay.client'

// 将元转换为整数分。
const cents = (v: Prisma.Decimal) => Math.round(Number(v) * 100)
// 取消订单操作人信息。
type Operator = {
  // 记录编号。
  id: number
  // 账号角色。
  role: string
  // 并发更新版本号。
  version?: number
}
// 微信支付业务服务。
@Injectable()
export class PaymentService {
  // 业务日志记录器。
  private readonly logger = new Logger(PaymentService.name)
  // 补偿任务是否执行中。
  private running = false
  // 订单最近查单时间缓存。
  private readonly checked = new Map<number, number>()
  // 注入本模块所需的业务依赖。
  constructor(
    // 当前事务或默认数据库连接。
    private readonly db: PrismaService,
    // 微信支付客户端。
    private readonly wx: WechatPayClient,
    // 业务数据访问层。
    private readonly repo: OrdersRepository,
  ) {}
  // 确认微信支付配置完整可用。
  assertConfigured() {
    // 1. 读取缓存中的微信支付配置。
    this.wx.config()
  }
  // 获取订单操作租约并在处理后释放。
  private async locked<T>(
    // 当前操作的记录编号。
    id: number,
    // 取得租约后执行的业务操作。
    work: () => Promise<T>,
  ) {
    // 1. 生成租约标识和当前时间。
    const token = randomUUID(),
      now = new Date()
    // 2. 抢占已空闲或过期的订单操作租约。
    const claimed = await this.db.order.updateMany({
      where: {
        id,
        OR: [{ paymentLeaseUntil: null }, { paymentLeaseUntil: { lt: now } }],
      },
      data: {
        paymentLeaseToken: token,
        paymentLeaseUntil: new Date(Date.now() + 120000),
      },
    })
    if (claimed.count !== 1)
      throw new ConflictException('支付状态正在处理中，请稍后重试')
    // 3. 执行订单操作，并在结束后释放本次租约。
    try {
      return await work()
    } finally {
      await this.db.order.updateMany({
        where: { id, paymentLeaseToken: token },
        data: { paymentLeaseToken: null, paymentLeaseUntil: null },
      })
    }
  }
  // 获取订单的微信支付参数。
  async pay(
    // 用户编号。
    userId: number,
    // 业务订单编号。
    orderNo: string,
    // 微信用户标识。
    openid: string,
  ) {
    // 1. 校验支付配置并确认订单归属。
    this.assertConfigured()
    // 已查询的目标记录。
    const selected = await this.db.order.findFirst({
      where: { userId, orderNo },
    })
    if (!selected) throw new NotFoundException('订单不存在')
    return this.locked(selected.id, async () => {
      // 当前订单信息。
      // 2. 取得操作租约后，校验订单状态和支付期限。
      const order = await this.db.order.findUniqueOrThrow({
        where: { id: selected.id },
      })
      if (
        order.type !== 'ORDINARY' ||
        order.status !== 'PENDING_PAYMENT' ||
        order.paymentStatus !== 'PENDING' ||
        order.expiresAt <= new Date() ||
        cents(order.payableAmount) <= 0
      )
        throw new ConflictException('当前订单不可支付，请查看订单状态')
      // 同一业务订单固定使用一个商户交易号，重试和并发请求共用。
      const outTradeNo =
        'F' +
        createHash('sha256').update(order.orderNo).digest('hex').slice(0, 31)
      // 微信支付记录。
      // 3. 按订单固定交易号，创建或复用支付记录。
      const payment = await this.db.$transaction(async (tx) => {
        // 当前记录或更新结果。
        const current = await tx.order.updateMany({
          where: {
            id: order.id,
            version: order.version,
            status: 'PENDING_PAYMENT',
            paymentLeaseToken: order.paymentLeaseToken,
            paymentLeaseUntil: { gt: new Date() },
          },
          data: { version: { increment: 1 } },
        })
        if (current.count !== 1)
          throw new ConflictException('订单支付状态已变化')
        return tx.payment.upsert({
          where: { outTradeNo },
          update: {},
          create: {
            orderId: order.id,
            outTradeNo,
            amount: order.payableAmount,
            expiresAt: order.expiresAt,
            payerOpenId: openid,
          },
        })
      })
      if (payment.payerOpenId !== openid || payment.status !== 'PENDING')
        throw new ConflictException('支付身份或状态已变化')
      // 微信返回的交易状态。
      // 4. 先向微信查单，避免已付款订单再次支付。
      const remote = await this.query(payment)
      if (remote?.trade_state === 'SUCCESS') {
        await this.paid(remote)
        throw new ConflictException('订单已支付，请查看订单')
      }
      if (remote && remote.trade_state !== 'NOTPAY')
        throw new ConflictException('微信交易不可继续支付')
      // 微信预支付会话标识。
      // 5. 复用预支付会话，缺失时按原交易号向微信下单。
      let prepayId = payment.prepayId
      if (!prepayId) {
        // 操作租约仍有效的订单。
        const active = await this.db.order.findFirst({
          where: {
            id: order.id,
            status: 'PENDING_PAYMENT',
            paymentLeaseToken: order.paymentLeaseToken,
            paymentLeaseUntil: { gt: new Date() },
          },
        })
        if (!active)
          throw new ConflictException('支付操作已过期，请重新查询订单')
        // 微信支付配置。
        const cfg = this.wx.config()
        // 微信接口原始响应。
        const response = await this.wx.request<{
          // 微信预支付会话标识。
          prepay_id: string
        }>('POST', '/v3/pay/transactions/jsapi', {
          appid: cfg.APPID,
          mchid: cfg.MCH_ID,
          description: '鲜花订单',
          out_trade_no: outTradeNo,
          notify_url: cfg.NOTIFY_URL,
          time_expire: order.expiresAt.toISOString(),
          amount: { total: cents(order.payableAmount), currency: 'CNY' },
          payer: { openid },
        })
        if (!response.prepay_id)
          throw new ConflictException('微信预支付结果未确认，请重试')
        prepayId = response.prepay_id
        await this.db.payment.update({
          where: { id: payment.id },
          data: { prepayId },
        })
      }
      // 再次查询的最新状态。
      // 6. 再次确认订单状态，返回小程序支付签名参数。
      const latest = await this.db.order.findUniqueOrThrow({
        where: { id: order.id },
      })
      if (latest.status !== 'PENDING_PAYMENT')
        throw new ConflictException('订单状态已变化，请查看订单')
      return { orderId: order.orderNo, ...this.wx.clientParams(prepayId) }
    })
  }
  // 按商户交易号查询微信订单。
  private async query(
    // 微信支付记录。
    payment: Payment,
  ) {
    // 1. 查询微信交易，仅将订单不存在视为尚未下单。
    try {
      return await this.wx.query(payment.outTradeNo)
    } catch (e) {
      if (e instanceof WxApiError && e.wxCode === 'ORDER_NOT_EXIST') return null
      throw e
    }
  }
  // 确认收款并同步订单、优惠券和支付流水。
  async paid(
    // 本次处理结果。
    result: WxTransaction,
  ) {
    // 1. 核对商户、应用、币种和支付成功时间。
    const cfg = this.wx.config()
    if (
      result.trade_state !== 'SUCCESS' ||
      result.appid !== cfg.APPID ||
      result.mchid !== cfg.MCH_ID ||
      !result.transaction_id ||
      result.amount?.currency !== 'CNY' ||
      !Number.isFinite(Date.parse(result.success_time))
    )
      throw new BadRequestException('支付通知业务字段不匹配')
    await this.db.$transaction(async (tx) => {
      // 微信支付记录。
      // 2. 在事务中核对原支付金额、付款人和重复通知。
      const payment = await tx.payment.findUnique({
        where: { outTradeNo: result.out_trade_no },
      })
      if (
        !payment ||
        cents(payment.amount) !== result.amount.total ||
        !payment.payerOpenId ||
        payment.payerOpenId !== result.payer?.openid
      )
        throw new BadRequestException('支付订单、金额或付款人不匹配')
      if (payment.status === 'SUCCEEDED') {
        if (payment.transactionId !== result.transaction_id)
          throw new ConflictException('微信交易号不匹配')
        return
      }
      // 当前订单信息。
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
      })
      if (
        !['PENDING_PAYMENT', 'CANCELLING'].includes(order.status) ||
        order.paymentStatus !== 'PENDING'
      )
        throw new ConflictException('订单状态与收款结果冲突，请人工核对')
      // 条件更新的影响行数。
      // 3. 按订单版本更新收款状态并保存微信交易号。
      const changed = await tx.order.updateMany({
        where: {
          id: order.id,
          version: order.version,
          paymentStatus: 'PENDING',
        },
        data: {
          paymentStatus: 'PAID',
          status:
            order.status === 'CANCELLING' ? 'CANCELLING' : 'PENDING_ACCEPTANCE',
          confirmedAt: new Date(result.success_time),
          version: { increment: 1 },
        },
      })
      if (changed.count !== 1)
        throw new ConflictException('订单状态已变化，请重试')
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCEEDED',
          transactionId: result.transaction_id,
          paidAt: new Date(result.success_time),
        },
      })
      // 4. 核销当前订单锁定的优惠券。
      if (order.couponId) {
        // 优惠券核销结果。
        const used = await tx.userCoupon.updateMany({
          where: {
            id: order.couponId,
            userId: order.userId,
            currentOrderId: order.id,
            status: 'LOCKED',
          },
          data: { status: 'USED', usedAt: new Date() },
        })
        if (used.count !== 1) throw new ConflictException('订单优惠券状态异常')
        await tx.couponEvent.create({
          data: {
            couponId: order.couponId,
            orderId: order.id,
            type: 'USED',
            operationKey: `used:${order.id}`,
            remark: '微信支付成功核销优惠券',
          },
        })
      }
      // 5. 记录支付成功日志，保证重复回调不重复入账。
      await tx.orderLog.create({
        data: {
          orderId: order.id,
          actorType: 'SYSTEM',
          action: 'PAY',
          fromStatus: order.status,
          toStatus:
            order.status === 'CANCELLING' ? 'CANCELLING' : 'PENDING_ACCEPTANCE',
          fromPaymentStatus: 'PENDING',
          toPaymentStatus: 'PAID',
          operationKey: `paid:${order.id}`,
        },
      })
    })
  }
  // 查单并补偿本地支付状态。
  async sync(
    // 订单编号。
    orderId: number,
    // 是否限制查单频率。
    limited = false,
  ) {
    // 1. 限制订单详情的查单频率。
    if (limited && (this.checked.get(orderId) ?? 0) > Date.now() - 10000) return
    if (this.checked.size > 10000) this.checked.clear()
    this.checked.set(orderId, Date.now())
    // 2. 读取尚未确认的支付记录。
    const payment = await this.db.payment.findFirst({
      where: { orderId, status: 'PENDING' },
    })
    // 3. 查询微信交易，发现已收款时补记支付结果。
    if (payment) {
      // 本次处理结果。
      const result = await this.query(payment)
      if (result?.trade_state === 'SUCCESS') await this.paid(result)
    }
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
    operator?: Operator,
  ) {
    // 1. 确认订单归属并取得操作租约。
    const selected = await this.db.order.findFirst({
      where: { userId, orderNo },
    })
    if (!selected) throw new NotFoundException('订单不存在')
    return this.locked(selected.id, async () => {
      // 当前订单信息。
      let order = await this.db.order.findUniqueOrThrow({
        where: { id: selected.id },
      })
      // 2. 已取消或关闭的订单直接返回。
      if (['CANCELLED', 'CLOSED'].includes(order.status))
        return this.repo.getById(order.id)
      // 3. 超时关闭前先查单，已收款订单保留正常履约。
      if (expired && order.status === 'PENDING_PAYMENT') {
        await this.sync(order.id)
        order = await this.db.order.findUniqueOrThrow({
          where: { id: selected.id },
        })
        if (order.paymentStatus === 'PAID') return this.repo.getById(order.id)
      }
      // 4. 按操作人权限校验取消范围并记录取消申请。
      if (order.status !== 'CANCELLING') {
        if (
          operator?.version !== undefined &&
          order.version !== operator.version
        )
          throw new ConflictException('订单已变化，请刷新')
        // 允许的业务状态。
        const allowed = expired
          ? ['PENDING_PAYMENT']
          : operator
            ? ['PENDING_PAYMENT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'READY']
            : ['PENDING_PAYMENT', 'PENDING_ACCEPTANCE']
        if (
          !allowed.includes(order.status) ||
          (expired && order.expiresAt > new Date())
        )
          throw new ConflictException('当前订单不能取消')
        await this.db.$transaction(async (tx) => {
          // 状态更新结果。
          const change = await tx.order.updateMany({
            where: {
              id: order.id,
              version: order.version,
              status: order.status,
            },
            data: {
              status: 'CANCELLING',
              cancelReason: expired ? '订单超时关闭' : '取消订单',
              version: { increment: 1 },
            },
          })
          if (change.count !== 1)
            throw new ConflictException('订单状态已变化，请重试')
          await tx.orderLog.create({
            data: {
              orderId: order.id,
              actorType: expired
                ? 'SYSTEM'
                : operator
                  ? operator.role === 'STORE_MANAGER'
                    ? 'MANAGER'
                    : 'ADMIN'
                  : 'USER',
              actorId: expired ? null : (operator?.id ?? userId),
              action: 'CANCEL_REQUEST',
              fromStatus: order.status,
              toStatus: 'CANCELLING',
              fromPaymentStatus: order.paymentStatus,
              toPaymentStatus: order.paymentStatus,
              operationKey: `cancel-request:${order.id}`,
              remark: expired ? 'EXPIRE' : 'CANCEL',
            },
          })
        })
      }
      // 5. 执行关单或退款，返回当前处理状态。
      await this.settleCancellation(order.id)
      return this.repo.getById(order.id)
    })
  }
  // 根据收款状态执行关单或退款。
  private async settleCancellation(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 3. 重新读取订单，避免覆盖并发到达的收款结果。
    // 1. 读取订单和最近一次支付记录。
    let order = await this.db.order.findUniqueOrThrow({ where: { id } })
    // 微信支付记录。
    const payment = await this.db.payment.findFirst({
      where: { orderId: id },
      orderBy: { id: 'desc' },
    })
    // 2. 查询微信交易，确认收款或关闭尚未支付的交易。
    if (order.paymentStatus === 'PENDING' && payment) {
      // 微信返回的交易状态。
      let remote = await this.query(payment)
      if (remote?.trade_state === 'SUCCESS') await this.paid(remote)
      else if (remote?.trade_state !== 'CLOSED') {
        // 下单结果不明确时，不直接视为微信订单已关闭。
        // 先按原参数补下单再关单，避免延迟请求重新开放支付。
        if (!remote) {
          // 微信支付配置。
          const cfg = this.wx.config()
          if (payment.expiresAt <= new Date()) {
            // 原支付截止时间已过，未创建的交易无法再按原参数收款。
            remote = null
          } else {
            await this.wx.request('POST', '/v3/pay/transactions/jsapi', {
              appid: cfg.APPID,
              mchid: cfg.MCH_ID,
              description: '鲜花订单',
              out_trade_no: payment.outTradeNo,
              notify_url: cfg.NOTIFY_URL,
              time_expire: payment.expiresAt.toISOString(),
              amount: { total: cents(payment.amount), currency: 'CNY' },
              payer: { openid: payment.payerOpenId },
            })
            remote = await this.query(payment)
          }
        }
        if (remote?.trade_state === 'SUCCESS') await this.paid(remote)
        else if (remote) {
          try {
            await this.wx.close(payment.outTradeNo)
          } catch (e) {
            // 再次查询的最新状态。
            const latest = await this.query(payment)
            if (latest?.trade_state === 'SUCCESS') await this.paid(latest)
            else if (latest?.trade_state !== 'CLOSED') throw e
          }
        }
      }
    }
    order = await this.db.order.findUniqueOrThrow({ where: { id } })
    if (order.paymentStatus === 'PENDING') {
      // 4. 未收款订单确认取消，并关闭本地支付记录。
      await this.db.$transaction(async (tx) => {
        // 当前记录或更新结果。
        const current = await tx.order.findUniqueOrThrow({ where: { id } })
        if (
          current.paymentStatus !== 'PENDING' ||
          current.status !== 'CANCELLING'
        )
          throw new ConflictException('支付状态已变化')
        // 订单取消申请日志。
        const request = await tx.orderLog.findUnique({
          where: { operationKey: `cancel-request:${id}` },
        })
        await this.finishCancel(
          tx,
          current,
          request?.remark === 'EXPIRE',
          false,
        )
        await tx.payment.updateMany({
          where: { orderId: id, status: 'PENDING' },
          data: { status: 'CLOSED' },
        })
      })
    } else if (
      ['PAID', 'REFUNDING', 'REFUND_FAILED'].includes(order.paymentStatus)
    ) {
      // 5. 已收款订单进入原路退款流程。
      await this.ensureRefund(order)
    }
  }
  // 创建或恢复整单退款请求。
  private async ensureRefund(
    // 当前订单信息。
    order: Order,
  ) {
    // 1. 查询当前订单的退款记录。
    let refund = await this.db.refund.findUnique({
      where: { orderId: order.id },
    })
    // 2. 根据原支付记录和取消申请创建唯一退款单。
    if (!refund) {
      refund = await this.db.$transaction(async (tx) => {
        // 微信支付记录。
        const payment = await tx.payment.findFirstOrThrow({
          where: { orderId: order.id, status: 'SUCCEEDED' },
        })
        // 订单取消申请日志。
        const request = await tx.orderLog.findUniqueOrThrow({
          where: { operationKey: `cancel-request:${order.id}` },
        })
        // 条件更新的影响行数。
        const changed = await tx.order.updateMany({
          where: {
            id: order.id,
            status: 'CANCELLING',
            paymentStatus: 'PAID',
            version: order.version,
          },
          data: { paymentStatus: 'REFUNDING', version: { increment: 1 } },
        })
        if (changed.count !== 1) throw new ConflictException('退款状态已变化')
        return tx.refund.create({
          data: {
            orderId: order.id,
            paymentId: payment.id,
            outRefundNo: 'R' + randomUUID().replace(/-/g, '').slice(0, 31),
            amount: payment.amount,
            reason: order.cancelReason ?? '取消订单',
            adminId: request.actorType === 'ADMIN' ? request.actorId : null,
          },
        })
      })
    }
    // 3. 已成功或需人工处理的退款停止自动提交。
    if (refund.status === 'SUCCEEDED' || refund.status === 'FAILED') return
    // 本次处理结果。
    let result: WxRefund
    try {
      // 4. 先查询原退款单，避免网络重试重复退款。
      result = await this.wx.queryRefund(refund.outRefundNo)
    } catch (e) {
      if (!(e instanceof WxApiError) || e.wxCode !== 'RESOURCE_NOT_EXISTS')
        throw e
      // 5. 检查重试上限，超限时记录人工处理原因。
      if (refund.retryCount >= 8) {
        await this.refundFailed(
          refund.id,
          order.id,
          '退款请求超过重试上限，请人工核对',
        )
        return
      }
      await this.db.refund.update({
        where: { id: refund.id },
        data: { retryCount: { increment: 1 } },
      })
      // 微信支付记录。
      const payment = await this.db.payment.findUniqueOrThrow({
        where: { id: refund.paymentId },
      })
      // 6. 使用原退款单号申请全额退款。
      result = await this.wx.request<WxRefund>(
        'POST',
        '/v3/refund/domestic/refunds',
        {
          transaction_id: payment.transactionId,
          out_refund_no: refund.outRefundNo,
          reason: refund.reason,
          notify_url: this.wx.config().REFUND_NOTIFY_URL,
          amount: {
            refund: cents(refund.amount),
            total: cents(payment.amount),
            currency: 'CNY',
          },
        },
      )
    }
    // 7. 根据微信返回状态更新退款进度。
    await this.refunded(result)
  }
  // 记录退款异常并停止自动提交。
  private async refundFailed(
    // 当前操作的记录编号。
    id: number,
    // 订单编号。
    orderId: number,
    // 业务操作原因。
    reason: string,
  ) {
    // 1. 在事务中记录退款失败及订单异常状态。
    await this.db.$transaction(async (tx) => {
      // 条件更新的影响行数。
      const changed = await tx.refund.updateMany({
        where: { id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', failureReason: reason },
      })
      if (changed.count)
        await tx.order.updateMany({
          where: {
            id: orderId,
            status: 'CANCELLING',
            paymentStatus: 'REFUNDING',
          },
          data: { paymentStatus: 'REFUND_FAILED', version: { increment: 1 } },
        })
    })
    // 2. 记录需要人工核对的退款原因。
    this.logger.error(`退款异常 order=${orderId} refund=${id}: ${reason}`)
  }
  // 核对退款结果并完成订单取消。
  async refunded(
    // 本次处理结果。
    result: WxRefund,
  ) {
    // 1. 读取退款状态并关联原支付记录。
    const status = result.refund_status ?? result.status
    // 退款记录或退款金额。
    const refund = await this.db.refund.findUnique({
      where: { outRefundNo: result.out_refund_no },
      include: { payment: true },
    })
    // 2. 核对退款单号、商户、原交易和退款金额。
    if (
      !refund ||
      !result.refund_id ||
      result.transaction_id !== refund.payment.transactionId ||
      result.out_trade_no !== refund.payment.outTradeNo ||
      (result.mchid !== undefined &&
        result.mchid !== this.wx.config().MCH_ID) ||
      (result.amount?.currency !== 'CNY' &&
        !(result.refund_status && result.amount?.currency === undefined)) ||
      result.amount?.total !== cents(refund.payment.amount) ||
      result.amount?.refund !== cents(refund.amount)
    )
      throw new BadRequestException('退款通知业务字段不匹配')
    if (refund.wechatRefundId && refund.wechatRefundId !== result.refund_id)
      throw new BadRequestException('退款流水号不匹配')
    // 3. 退款成功后幂等取消订单并释放预留资源。
    if (status === 'SUCCESS') {
      if (
        !result.success_time ||
        !Number.isFinite(Date.parse(result.success_time))
      )
        throw new BadRequestException('退款成功时间无效')
      await this.db.$transaction(async (tx) => {
        // 当前记录或更新结果。
        const current = await tx.refund.findUniqueOrThrow({
          where: { id: refund.id },
        })
        if (current.status === 'SUCCEEDED') return
        // 当前订单信息。
        const order = await tx.order.findUniqueOrThrow({
          where: { id: refund.orderId },
        })
        if (
          order.status !== 'CANCELLING' ||
          !['REFUNDING', 'REFUND_FAILED'].includes(order.paymentStatus)
        )
          throw new ConflictException('退款订单状态异常')
        await this.finishCancel(tx, order, false, true)
        await tx.refund.update({
          where: { id: refund.id },
          data: {
            status: 'SUCCEEDED',
            wechatRefundId: result.refund_id,
            succeededAt: new Date(result.success_time!),
            couponReturnedAt: order.couponId ? new Date() : null,
            failureReason: null,
          },
        })
      })
    } else if (status === 'PROCESSING') {
      // 4. 退款处理中只更新进度，不提前返还库存。
      await this.db.refund.updateMany({
        where: { id: refund.id, status: 'PENDING' },
        data: { status: 'PROCESSING', wechatRefundId: result.refund_id },
      })
    } else if (['CLOSED', 'ABNORMAL'].includes(status ?? ''))
      // 5. 退款关闭或异常时转为人工处理。
      await this.refundFailed(
        refund.id,
        refund.orderId,
        `微信退款状态：${status}，请在商户平台处理`,
      )
    else throw new BadRequestException('未知退款状态')
  }
  // 完成订单取消并返还库存和优惠券。
  private async finishCancel(
    // 当前数据库事务。
    tx: Prisma.TransactionClient,
    // 当前订单信息。
    order: Order,
    // 是否由超时关闭触发。
    expired: boolean,
    // 是否已确认退款成功。
    refunded: boolean,
  ) {
    // 1. 根据超时关闭或退款结果确定终态。
    const status = expired ? 'CLOSED' : 'CANCELLED',
      paymentStatus = refunded ? 'REFUNDED' : 'CLOSED'
    // 2. 按订单版本提交取消状态，避免并发重复处理。
    const change = await tx.order.updateMany({
      where: {
        id: order.id,
        version: order.version,
        status: 'CANCELLING',
        paymentStatus: order.paymentStatus,
      },
      data: {
        status,
        paymentStatus,
        version: { increment: 1 },
        ...(expired ? { closedAt: new Date() } : { cancelledAt: new Date() }),
      },
    })
    if (change.count !== 1)
      throw new ConflictException('取消状态已变化，请重试')
    // 3. 按优惠券原有效期返还当前订单用券。
    if (order.couponId)
      await returnCoupon(tx, order.couponId, order.userId, order.id)
    // 4. 按原预留流水释放库存，并记录释放流水。
    const reservations = await this.repo.findReservations(order.id, tx)
    if (!reservations.length) throw new ConflictException('库存预留流水缺失')
    for (const r of reservations) {
      // 商品份数、商品规格库存。
      const quantity = r.reservedAfter - r.reservedBefore,
        stock = await this.repo.getStock(r.stockId, tx)
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
          operationKey: `release:${order.id}:${stock.id}`,
          reason: refunded ? '退款成功释放库存' : '关单释放库存',
        },
        tx,
      )
    }
    // 5. 写入订单取消或退款完成日志。
    await tx.orderLog.create({
      data: {
        orderId: order.id,
        actorType: 'SYSTEM',
        action: refunded ? 'REFUND' : expired ? 'EXPIRE' : 'CANCEL',
        fromStatus: order.status,
        toStatus: status,
        fromPaymentStatus: order.paymentStatus,
        toPaymentStatus: paymentStatus,
        operationKey: `cancel:${order.id}`,
      },
    })
  }
  // 定时补偿未完成的支付和退款。
  @Interval(60000)
  async reconcile() {
    // 1. 防止本进程重复启动补偿任务。
    if (this.running) return
    this.running = true
    try {
      // 分页查询起始编号。
      // 2. 按订单编号分页读取待处理记录。
      let cursor = 0
      for (;;) {
        // 待处理订单列表。
        const orders = await this.db.order.findMany({
          where: {
            id: { gt: cursor },
            type: 'ORDINARY',
            OR: [
              { status: 'CANCELLING', paymentStatus: { not: 'REFUND_FAILED' } },
              {
                status: 'PENDING_PAYMENT',
                payments: { some: { status: 'PENDING' } },
              },
            ],
          },
          take: 100,
          orderBy: { id: 'asc' },
        })
        // 逐项处理：当前订单信息。
        // 3. 逐单补偿支付或取消流程，失败记录日志后继续。
        for (const order of orders) {
          try {
            if (order.status === 'CANCELLING')
              await this.locked(order.id, () =>
                this.settleCancellation(order.id),
              )
            else await this.sync(order.id)
          } catch (e) {
            this.logger.warn(
              `支付补偿未完成 order=${order.id} ${e instanceof Error ? e.message : 'unknown'}`,
            )
          }
        }
        // 4. 当前页不足一百条时结束，否则继续下一页。
        if (orders.length < 100) break
        cursor = orders[orders.length - 1].id
      }
    } finally {
      // 5. 释放本进程的补偿任务执行标记。
      this.running = false
    }
  }
}
