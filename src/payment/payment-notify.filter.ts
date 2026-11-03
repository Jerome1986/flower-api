import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common'
import type { Response } from 'express'

// 微信回调异常响应处理器。
@Catch()
export class PaymentNotifyFilter implements ExceptionFilter {
  // 业务日志记录器。
  private readonly logger = new Logger(PaymentNotifyFilter.name)
  // 将回调处理异常转换为微信要求的失败响应。
  catch(
    // 捕获的业务或数据库异常。
    error: unknown,
    // HTTP 异常处理上下文。
    host: ArgumentsHost,
  ) {
    // 1. 准备回调失败时返回的 HTTP 状态码。
    const status = error instanceof HttpException ? error.getStatus() : 500
    // 日志只记录处理状态，不输出原始报文、个人信息或密钥。
    this.logger.warn(`微信回调处理未完成 status=${status}`)
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ code: 'FAIL', message: '通知处理失败，请重试' })
  }
}
