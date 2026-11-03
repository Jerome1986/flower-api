import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
  UseFilters,
} from '@nestjs/common'
import { Type } from 'class-transformer'
import {
  IsDefined,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { RawResponse } from '../common/decorators/raw-response.decorator'
import { CreateOrderDto } from '../orders/dto/create-order.dto'
import { OrdersService } from '../orders/orders.service'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import { UserAuthService } from '../user-auth/user-auth.service'
import type { UserRequest } from '../user-auth/user-auth.types'
import { PaymentService } from './payment.service'
import { WechatPayClient, WxRefund, WxTransaction } from './wechat-pay.client'
import { PaymentNotifyFilter } from './payment-notify.filter'

// 新建支付请求参数。
export class PaymentSubmission extends CreateOrderDto {
  // 微信用户标识。
  @IsString() @IsNotEmpty() @MaxLength(128) openid!: string
}
// 继续支付请求参数。
export class ContinuePayment {
  // 业务订单编号。
  @IsString() @IsNotEmpty() @MaxLength(64) orderId!: string
  // 微信用户标识。
  @IsString() @IsNotEmpty() @MaxLength(128) openid!: string
}
// 零元订单请求参数。
export class FreePayment {
  // 接口业务参数。
  @IsDefined()
  @ValidateNested()
  @Type(() => PaymentSubmission)
  params!: PaymentSubmission
}
// 微信支付接口入口。
@Controller()
@UseGuards(UserAuthGuard)
export class PaymentController {
  // 注入本模块所需的业务依赖。
  constructor(
    // 订单业务服务。
    private readonly orders: OrdersService,
    // 支付与退款业务服务。
    private readonly payments: PaymentService,
    // 用户身份校验服务。
    private readonly users: UserAuthService,
  ) {}
  // 核对登录用户与付款微信身份。
  private async identity(
    // 当前操作的记录编号。
    id: number,
    // 微信用户标识。
    openid: string,
  ) {
    // 1. 准备当前用户信息。
    const user = await this.users.currentUser(id)
    // 2. 不满足要求时提示：微信登录身份不匹配。
    if (!user.openId || user.openId !== openid)
      throw new BadRequestException('微信登录身份不匹配，请重新登录')
  }
  // 创建订单并获取微信支付参数。
  @Post('pay/commonPay')
  @HttpCode(200)
  async common(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: PaymentSubmission,
  ) {
    // 1. 核对登录用户与付款微信身份。
    await this.identity(req.userId, dto.openid)
    // 2. 确认微信支付配置完整可用。
    this.payments.assertConfigured()
    // 3. 不满足要求时提示：零元订单请使用零元下单接口。
    if (dto.expectedAmount <= 0)
      throw new BadRequestException('零元订单请使用零元下单接口')
    // 4. 准备当前订单信息。
    const order = await this.orders.create(req.userId, dto)
    // 5. 获取订单的微信支付参数。
    return this.payments.pay(req.userId, order.orderNo, dto.openid)
  }
  // 为已有订单获取继续支付参数。
  @Post('pay/orderPay')
  @HttpCode(200)
  async continue(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: ContinuePayment,
  ) {
    // 1. 核对登录用户与付款微信身份。
    await this.identity(req.userId, dto.openid)
    // 2. 获取订单的微信支付参数。
    return this.payments.pay(req.userId, dto.orderId, dto.openid)
  }
  // 校验并创建零元订单。
  @Post('order/createOrderFree')
  @HttpCode(200)
  async free(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: FreePayment,
  ) {
    // 1. 核对登录用户与付款微信身份。
    await this.identity(req.userId, dto.params.openid)
    // 2. 不满足要求时提示：该接口仅支持零元订单。
    if (dto.params.expectedAmount !== 0)
      throw new BadRequestException('该接口仅支持零元订单')
    // 创建订单时重新核算金额，再预留库存和处理优惠券。
    const order = await this.orders.create(req.userId, dto.params)
    // 3. 返回本次处理结果。
    return { orderId: order.orderNo }
  }
}
// 微信支付接口入口。
@Controller('notify')
@RawResponse()
@UseFilters(PaymentNotifyFilter)
export class PaymentNotifyController {
  // 注入本模块所需的业务依赖。
  constructor(
    // 支付与退款业务服务。
    private readonly payments: PaymentService,
    // 微信支付客户端。
    private readonly wx: WechatPayClient,
  ) {}
  // 解密并处理微信支付成功通知。
  @Post('wxPay')
  @HttpCode(204)
  async pay(
    // 微信回调请求体。
    @Body() body: unknown,
  ) {
    // 1. 确认收款并同步订单、优惠券和支付流水。
    await this.payments.paid(
      this.wx.notification<WxTransaction>(body, 'TRANSACTION.SUCCESS'),
    )
  }
  // 解密并处理微信退款通知。
  @Post('wxRefund')
  @HttpCode(204)
  async refund(
    // 微信回调请求体。
    @Body() body: unknown,
  ) {
    // 1. 准备本次处理结果。
    const result = this.wx.notification<WxRefund>(body, 'REFUND.')
    // 2. 不满足要求时提示：退款商户不匹配。
    if (result.mchid !== this.wx.config().MCH_ID)
      throw new BadRequestException('退款商户不匹配')
    // 3. 核对退款结果并完成订单取消。
    await this.payments.refunded(result)
  }
}
