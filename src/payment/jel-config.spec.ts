import { createCipheriv, generateKeyPairSync } from 'node:crypto'
import axios from 'axios'
import * as merchantKey from '../utils/wechat-pay'
import { WechatPayClient } from './wechat-pay.client'
jest.mock('axios')

describe('jel 支付配置兼容', () => {
  const originalEnv = process.env
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  beforeEach(() => {
    process.env = {
      APPID: 'app',
      MCH_ID: 'merchant',
      SERIALNO: 'serial',
      API_V3_KEY: 'a'.repeat(32),
    }
    jest
      .spyOn(merchantKey, 'getPrivateKey')
      .mockReturnValue(
        keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      )
  })
  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  test('基础配置不再要求公钥和退款通知地址', () => {
    const cfg = new WechatPayClient().config()
    expect(cfg.privateKey.type).toBe('private')
    process.env.NOTIFY_URL = 'https://flower.example/api/notify/wxPay'
    expect(cfg.NOTIFY_URL).toBe(process.env.NOTIFY_URL)
    expect(() => cfg.REFUND_NOTIFY_URL).toThrow('REFUND_NOTIFY_URL')
  })
  test('回调地址按使用场景独立校验', () => {
    const cfg = new WechatPayClient().config()
    expect(() => cfg.NOTIFY_URL).toThrow('NOTIFY_URL')
    process.env.NOTIFY_URL = 'http://localhost/pay'
    expect(() => cfg.NOTIFY_URL).toThrow('回调地址配置无效')
    process.env.REFUND_NOTIFY_URL = 'https://flower.example/api/notify/wxRefund'
    expect(cfg.REFUND_NOTIFY_URL).toBe(process.env.REFUND_NOTIFY_URL)
  })
  test('无效基础密钥不能启动支付', () => {
    process.env.API_V3_KEY = 'invalid'
    expect(() => new WechatPayClient().config()).toThrow('支付密钥配置无效')
  })
  test('发送商户签名且不依赖微信公钥编号', async () => {
    const request = axios.request as jest.Mock
    request.mockResolvedValue({
      status: 200,
      data: '{"prepay_id":"test"}',
      headers: {},
    })
    const client = new WechatPayClient()
    await expect(
      client.request('POST', '/v3/pay/transactions/jsapi', {}),
    ).resolves.toEqual({ prepay_id: 'test' })
    expect(request.mock.calls.at(-1)[0].headers.Authorization).toContain(
      'WECHATPAY2-SHA256-RSA2048',
    )
    expect(request.mock.calls.at(-1)[0].headers).not.toHaveProperty(
      'Wechatpay-Serial',
    )
  })
  test('兼容通知必须通过 AES-GCM 认证解密，篡改密文和事件类型均拒绝', () => {
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.API_V3_KEY!),
      '123456789012',
    )
    cipher.setAAD(Buffer.from('transaction'))
    const body = { out_trade_no: 'test', amount: { total: 100 } }
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(body)),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64')
    const event = {
      event_type: 'TRANSACTION.SUCCESS',
      resource: {
        algorithm: 'AEAD_AES_256_GCM',
        nonce: '123456789012',
        associated_data: 'transaction',
        ciphertext,
      },
    }
    const client = new WechatPayClient()
    expect(client.notification(event, 'TRANSACTION.SUCCESS')).toEqual(body)
    event.event_type = 'REFUND.SUCCESS'
    expect(() => client.notification(event, 'TRANSACTION.SUCCESS')).toThrow(
      '解密失败',
    )
    event.event_type = 'TRANSACTION.SUCCESS'
    event.resource.ciphertext = 'AAAA' + ciphertext.slice(4)
    expect(() => client.notification(event, 'TRANSACTION.SUCCESS')).toThrow(
      '解密失败',
    )
    expect(() => client.notification(undefined, 'TRANSACTION.SUCCESS')).toThrow(
      '支付通知',
    )
  })
})
