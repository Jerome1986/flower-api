import { Injectable } from '@nestjs/common'
import { WechatPayClient } from './wechat-pay.client'
import { yuanToFen } from '../utils/money'

// 按 jel 写法编排 JSAPI 下单，金额和付款身份由业务服务校验。
@Injectable()
export class PaymentRepository {
  constructor(private readonly wx: WechatPayClient) {}

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
}
