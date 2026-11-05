import { Injectable, BadRequestException, type RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { WechatPayClient, type WxTransaction, type WxRefund } from '../payment/wechat-pay.client'
import { PaymentService } from '../payment/payment.service'

// 先验证原始报文签名，再解密并派发实际支付业务。
@Injectable()
export class NotifyService {
  constructor(private readonly wx: WechatPayClient, private readonly payments: PaymentService) {}

  async wxNotify(req: RawBodyRequest<Request>) {
    this.wx.verifyMessage(req.rawBody, req.headers)
    await this.payments.paid(this.wx.notification<WxTransaction>(req.body, 'TRANSACTION.SUCCESS'))
  }

  async refundNotify(req: RawBodyRequest<Request>) {
    this.wx.verifyMessage(req.rawBody, req.headers)
    const result = this.wx.notification<WxRefund>(req.body, 'REFUND.')
    if (result.mchid !== this.wx.config().MCH_ID) throw new BadRequestException('退款商户不匹配')
    await this.payments.refunded(result)
  }
}
