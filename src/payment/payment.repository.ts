import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { WechatPayClient } from './wechat-pay.client'
import { yuanToFen } from '../utils/money'

// 按 jel 写法编排 JSAPI 下单，金额和付款身份由业务服务校验。
@Injectable()
export class PaymentRepository {
  constructor(
    // 微信请求与签名客户端。
    private readonly wx: WechatPayClient,
    // 全局数据库连接，事务由业务服务传入。
    private readonly db: PrismaService,
  ) {}

  // 按服务端订单金额生成 JSAPI 预支付会话和小程序签名参数。
  async wxPay(
    remark: string,
    outTradeNo: string,
    openid: string,
    amount: unknown,
    expiresAt?: Date,
  ) {
    const cfg = this.wx.config()
    const response = await this.wx.request<{ prepay_id: string }>(
      'POST',
      '/v3/pay/transactions/jsapi',
      {
        appid: cfg.APPID,
        mchid: cfg.MCH_ID,
        description: remark,
        out_trade_no: outTradeNo,
        notify_url: cfg.NOTIFY_URL,
        ...(expiresAt ? { time_expire: expiresAt.toISOString() } : {}),
        amount: { total: yuanToFen(amount), currency: 'CNY' },
        payer: { openid },
      },
    )
    if (!response.prepay_id)
      throw new Error('微信预支付结果未确认，请按原订单重试')
    return {
      prepayId: response.prepay_id,
      ...this.wx.clientParams(response.prepay_id),
    }
  }

  // 按版本和状态条件更新支付订单或租约。
  updateOrderState(
    args: Prisma.OrderUpdateManyArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.order.updateMany(args)
  }

  // 查找当前用户或租约对应的支付订单。
  findOrder(
    args: Prisma.OrderFindFirstArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.order.findFirst(args)
  }

  // 读取支付订单并在缺失时终止处理。
  getOrder(
    args: Prisma.OrderFindUniqueOrThrowArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.order.findUniqueOrThrow(args)
  }

  // 按唯一商户交易号创建或复用支付记录。
  upsertPayment(
    args: Prisma.PaymentUpsertArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.payment.upsert(args)
  }

  // 保存预支付会话或确认支付流水。
  updatePayment(
    args: Prisma.PaymentUpdateArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.payment.update(args)
  }

  // 按商户交易号查询原支付流水。
  findPayment(
    args: Prisma.PaymentFindUniqueArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.payment.findUnique(args)
  }

  // 按归属和占用状态条件核销订单优惠券。
  updateOrderCoupon(
    args: Prisma.UserCouponUpdateManyArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.userCoupon.updateMany(args)
  }

  // 记录订单优惠券状态变更流水。
  createCouponEvent(
    args: Prisma.CouponEventCreateArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.couponEvent.create(args)
  }

  // 记录支付或取消的幂等订单日志。
  createOrderLog(
    args: Prisma.OrderLogCreateArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.orderLog.create(args)
  }

  // 读取订单最新支付尝试。
  findLatestPayment(
    args: Prisma.PaymentFindFirstArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.payment.findFirst(args)
  }

  // 读取订单取消申请日志。
  findCancellationLog(
    args: Prisma.OrderLogFindUniqueArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.orderLog.findUnique(args)
  }

  // 条件更新待处理支付记录。
  updatePendingPayments(
    args: Prisma.PaymentUpdateManyArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.payment.updateMany(args)
  }

  // 读取原退款单及按需关联的支付信息。
  findRefund<T extends Prisma.RefundFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.RefundFindUniqueArgs>,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.refund.findUnique(args)
  }

  // 读取退款所需的成功支付流水。
  getSucceededPayment(
    args: Prisma.PaymentFindFirstOrThrowArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.payment.findFirstOrThrow(args)
  }

  // 读取退款所需的取消人身份和原因。
  getCancellationLog(
    args: Prisma.OrderLogFindUniqueOrThrowArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.orderLog.findUniqueOrThrow(args)
  }

  // 保存唯一整单退款申请。
  createRefund(
    args: Prisma.RefundCreateArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.refund.create(args)
  }

  // 记录微信退款进度及成功结果。
  updateRefund(
    args: Prisma.RefundUpdateArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.refund.update(args)
  }

  // 读取退款对应的原支付流水。
  getPayment(
    args: Prisma.PaymentFindUniqueOrThrowArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.payment.findUniqueOrThrow(args)
  }

  // 按原状态条件更新退款进度。
  updateRefundState(
    args: Prisma.RefundUpdateManyArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.refund.updateMany(args)
  }

  // 读取事务中的退款最新状态。
  getRefund(
    args: Prisma.RefundFindUniqueOrThrowArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.refund.findUniqueOrThrow(args)
  }

  // 分页读取需要支付补偿的订单。
  findReconciliationOrders(
    args: Prisma.OrderFindManyArgs,
    tx: Prisma.TransactionClient = this.db,
  ) {
    return tx.order.findMany(args)
  }
}
