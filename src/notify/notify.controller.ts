import { Controller, Post, Req, HttpCode, UseFilters, type RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { RawResponse } from '../common/decorators/raw-response.decorator'
import { PaymentNotifyFilter } from '../payment/payment-notify.filter'
import { NotifyService } from './notify.service'

// 微信通知免用户 JWT，通过微信公钥验证请求来源。
@Controller('notify')
@RawResponse()
@UseFilters(PaymentNotifyFilter)
export class NotifyController {
  constructor(private readonly service: NotifyService) {}

  // 标准通知入口及现有 wxPay 路径保持兼容。
  @Post(['', 'wxPay'])
  @HttpCode(204)
  async pay(@Req() req: RawBodyRequest<Request>) {
    await this.service.wxNotify(req)
  }

  // 保留现有退款通知入口，不新增退款业务种类。
  @Post('wxRefund')
  @HttpCode(204)
  async refund(@Req() req: RawBodyRequest<Request>) {
    await this.service.refundNotify(req)
  }
}
