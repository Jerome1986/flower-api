import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import axios from 'axios'
import {
  createDecipheriv,
  createPrivateKey,
  randomBytes,
  sign,
} from 'node:crypto'
import { readFileSync } from 'node:fs'
import { getPrivateKey } from '../utils/wechat-pay'

// 微信支付交易结果字段。
export interface WxTransaction {
  // 微信应用编号。
  appid: string
  // 微信支付商户号。
  mchid: string
  // 微信商户交易号。
  out_trade_no: string
  // 微信支付交易号。
  transaction_id: string
  // 微信交易状态。
  trade_state: string
  // 微信确认成功的时间。
  success_time: string
  // 付款人信息。
  payer: {
    // 微信用户标识。
    openid: string
  }
  // 业务金额。
  amount: {
    // 原支付订单金额（分）。
    total: number
    // 金额币种。
    currency: string
  }
}
// 微信退款结果字段。
export interface WxRefund {
  // 微信支付商户号。
  mchid?: string
  // 微信商户交易号。
  out_trade_no: string
  // 微信支付交易号。
  transaction_id: string
  // 商户退款单号。
  out_refund_no: string
  // 微信退款单号。
  refund_id: string
  // 当前业务状态。
  status?: string
  // 退款回调中的状态。
  refund_status?: string
  // 微信确认成功的时间。
  success_time?: string
  // 业务金额。
  amount: {
    // 原支付订单金额（分）。
    total: number
    // 本次退款金额（分）。
    refund: number
    // 金额币种。
    currency?: string
  }
}
// 保留微信错误码的接口异常。
export class WxApiError extends BadGatewayException {
  // 保存微信接口错误码。
  constructor(
    // 微信接口错误码。
    readonly wxCode: string,
  ) {
    // 1. 将微信错误码转换为接口异常提示。
    super(`微信支付请求失败：${wxCode}`)
  }
}

// 微信支付 V3 接口客户端。
@Injectable()
export class WechatPayClient {
  // 已校验的微信支付配置缓存。
  private cached?: ReturnType<WechatPayClient['readConfig']>
  // 读取并校验微信支付环境配置。
  private readConfig() {
    // 与 jel 一致：商户签名及 API V3 解密配置为基础必填项。
    const names = ['APPID', 'MCH_ID', 'SERIALNO', 'API_V3_KEY'] as const
    const missing: string[] = names.filter((name) => !process.env[name]?.trim())
    if (missing.length)
      throw new ServiceUnavailableException(
        '支付配置缺失：' + missing.join(', '),
      )
    const env = Object.fromEntries(
      names.map((name) => [name, process.env[name]!.trim()]),
    ) as Record<(typeof names)[number], string>
    // 回调地址只在发起对应支付/退款时校验；查询、解密及支付不依赖退款地址。
    const notifyUrl = (name: 'NOTIFY_URL' | 'REFUND_NOTIFY_URL') => {
      const value = process.env[name]?.trim()
      if (!value) throw new ServiceUnavailableException('支付配置缺失：' + name)
      try {
        const url = new URL(value)
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error()
        return value
      } catch {
        throw new ServiceUnavailableException('支付回调地址配置无效：' + name)
      }
    }
    try {
      if (Buffer.byteLength(env.API_V3_KEY) !== 32) throw new Error()
      const privateKeyPath = process.env.WECHAT_PAY_PRIVATE_KEY_PATH?.trim()
      return {
        ...env,
        privateKey: createPrivateKey(
          privateKeyPath ? readFileSync(privateKeyPath) : getPrivateKey(),
        ),
        get NOTIFY_URL() {
          return notifyUrl('NOTIFY_URL')
        },
        get REFUND_NOTIFY_URL() {
          return notifyUrl('REFUND_NOTIFY_URL')
        },
      }
    } catch {
      throw new ServiceUnavailableException(
        '支付密钥配置无效，请核对商户私钥及 API V3 密钥',
      )
    }
  }
  // 读取缓存中的微信支付配置。
  config() {
    // 1. 返回本次处理结果。
    return (this.cached ??= this.readConfig())
  }
  // 解密微信支付回调。
  notification<T>(
    // 微信回调请求体。
    event: any,
    // 期望接收的回调类型。
    eventType: string,
  ): T {
    // 1. 与 jel 一致，使用 API V3 密钥完成 AES-GCM 认证解密。
    if (!event || typeof event !== 'object')
      throw new UnauthorizedException('缺少微信支付通知')
    try {
      // 2. 解析通知并校验事件类型和加密算法。
      // 允许处理的微信回调事件类型。
      const allowed =
        eventType === 'TRANSACTION.SUCCESS'
          ? ['TRANSACTION.SUCCESS']
          : ['REFUND.SUCCESS', 'REFUND.ABNORMAL', 'REFUND.CLOSED']
      if (
        !allowed.includes(event.event_type) ||
        event.resource?.algorithm !== 'AEAD_AES_256_GCM'
      )
        throw new Error()
      // 回调中的加密资源、Base64 解码后的密文和认证标签。
      // 3. 提取密文、认证标签及附加认证数据。
      const resource = event.resource,
        data = Buffer.from(resource.ciphertext, 'base64')
      // 回调报文解密器。
      const decipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(this.config().API_V3_KEY),
        resource.nonce,
      )
      decipher.setAuthTag(data.subarray(-16))
      decipher.setAAD(Buffer.from(resource.associated_data ?? ''))
      // 本次处理结果。
      // 4. 解密并解析业务报文。
      const result = JSON.parse(
        Buffer.concat([
          decipher.update(data.subarray(0, -16)),
          decipher.final(),
        ]).toString('utf8'),
      )
      // 5. 确认退款事件与解密后的退款状态一致。
      if (
        eventType === 'REFUND.' &&
        event.event_type !== `REFUND.${result.refund_status}`
      )
        throw new Error()
      return result as T
    } catch {
      throw new UnauthorizedException('微信支付通知解密失败')
    }
  }
  // 签名请求微信接口并校验响应。
  async request<T>(
    // 微信接口 HTTP 请求方法。
    method: 'GET' | 'POST',
    // 微信接口请求路径。
    path: string,
    // 待保存或处理的数据。
    data?: unknown,
  ): Promise<T> {
    // 1. 读取商户配置并生成签名时间戳和随机串。
    const cfg = this.config(),
      timestamp = String(Math.floor(Date.now() / 1000)),
      nonce = randomBytes(16).toString('hex')
    // 参与签名的原始请求体。
    const body = data === undefined ? '' : JSON.stringify(data)
    // 2. 按请求方法、路径和原始请求体生成签名。
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`),
      cfg.privateKey,
    ).toString('base64')
    // 微信接口原始响应。
    let response
    try {
      // 3. 发送带签名的请求，限制超时且禁止重定向。
      response = await axios.request<string>({
        method,
        url: `https://api.mch.weixin.qq.com${path}`,
        data: body || undefined,
        timeout: 10000,
        signal: AbortSignal.timeout(10000),
        maxRedirects: 0,
        responseType: 'text',
        transformResponse: [(v) => v],
        validateStatus: () => true,
        headers: {
          Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${cfg.SERIALNO}",signature="${signature}"`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      })
    } catch {
      throw new BadGatewayException('微信支付请求结果未确认，请重试查询')
    }
    // 本次处理结果。
    let result: any
    try {
      // 5. 解析微信响应的 JSON 内容。
      result = response.data ? JSON.parse(response.data) : {}
    } catch {
      throw new BadGatewayException('微信支付响应格式错误')
    }
    // 6. 非成功响应转换为带微信错误码的异常。
    if (response.status < 200 || response.status >= 300)
      throw new WxApiError(
        typeof result.code === 'string' ? result.code : 'UNKNOWN',
      )
    return result as T
  }
  // 按商户交易号查询微信订单。
  query(
    // 业务订单或交易编号。
    no: string,
  ) {
    // 1. 签名请求微信接口并校验响应。
    return this.request<WxTransaction>(
      'GET',
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(no)}?mchid=${encodeURIComponent(this.config().MCH_ID)}`,
    )
  }
  // 关闭指定微信支付订单。
  close(
    // 业务订单或交易编号。
    no: string,
  ) {
    // 1. 签名请求微信接口并校验响应。
    return this.request(
      'POST',
      `/v3/pay/transactions/out-trade-no/${encodeURIComponent(no)}/close`,
      { mchid: this.config().MCH_ID },
    )
  }
  // 查询原商户退款单的处理结果。
  queryRefund(
    // 业务订单或交易编号。
    no: string,
  ) {
    // 1. 签名请求微信接口并校验响应。
    return this.request<WxRefund>(
      'GET',
      `/v3/refund/domestic/refunds/${encodeURIComponent(no)}`,
    )
  }
  // 生成小程序调起支付的签名参数。
  clientParams(
    // 微信预支付会话标识。
    prepayId: string,
  ) {
    // 1. 准备应用编号、时间戳和随机串。
    const cfg = this.config(),
      timeStamp = String(Math.floor(Date.now() / 1000)),
      nonceStr = randomBytes(16).toString('hex')
    // 2. 组装预支付会话参数。
    const packageValue = `prepay_id=${prepayId}`
    // 3. 使用商户私钥生成小程序支付签名。
    return {
      timeStamp,
      nonceStr,
      packageValue,
      signType: 'RSA' as const,
      paySign: sign(
        'RSA-SHA256',
        Buffer.from(
          `${cfg.APPID}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`,
        ),
        cfg.privateKey,
      ).toString('base64'),
    }
  }
}
