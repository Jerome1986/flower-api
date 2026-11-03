import { createCipheriv, generateKeyPairSync, verify } from 'node:crypto'
import axios from 'axios'
import { WechatPayClient, WxApiError } from './wechat-pay.client'
jest.mock('axios')

describe('微信 V3 加密与商户签名边界', () => {
  test('微信错误响应按业务错误码处理，不依赖微信公钥', async () => {
    const request = axios.request as jest.Mock
    request.mockResolvedValue({
      status: 404,
      data: '{"code":"ORDER_NOT_EXIST"}',
      headers: {},
    })
    await expect(client.request('GET', '/v3/test')).rejects.toBeInstanceOf(
      WxApiError,
    )
    request.mockResolvedValue({
      status: 404,
      data: '{"code":"ORDER_NOT_EXIST"}',
      headers: { 'wechatpay-signature': 'bad' },
    })
    await expect(client.request('GET', '/v3/test')).rejects.toBeInstanceOf(
      WxApiError,
    )
  })
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const cfg = {
    APPID: 'app',
    MCH_ID: 'merchant',
    SERIALNO: 'serial',
    API_V3_KEY: 'a'.repeat(32),
    privateKey: keys.privateKey,
  }
  let client: WechatPayClient
  beforeEach(() => {
    client = new WechatPayClient()
    jest.spyOn(client, 'config').mockReturnValue(cfg as any)
  })
  test('通知通过 AES-GCM 认证解密，篡改密文不能解密', () => {
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(cfg.API_V3_KEY),
      '123456789012',
    )
    cipher.setAAD(Buffer.from('transaction'))
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify({ amount: 123 })),
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
    expect(client.notification(event, 'TRANSACTION.SUCCESS')).toEqual({
      amount: 123,
    })
    event.resource.ciphertext = 'AAAA' + ciphertext.slice(4)
    expect(() => client.notification(event, 'TRANSACTION.SUCCESS')).toThrow(
      '解密失败',
    )
  })
  test('客户端参数 RSA 签名符合小程序签名串', () => {
    const p = client.clientParams('prepay')
    expect(p.packageValue).toBe('prepay_id=prepay')
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`app\n${p.timeStamp}\n${p.nonceStr}\n${p.packageValue}\n`),
        keys.publicKey,
        Buffer.from(p.paySign, 'base64'),
      ),
    ).toBe(true)
  })
  test('请求签名使用实际发送的 JSON，验证响应及空关单响应', async () => {
    const request = axios.request as jest.Mock
    request.mockImplementation(async (options) => {
      const auth = options.headers.Authorization
      const timestamp = /timestamp="([^"]+)"/.exec(auth)![1],
        nonce = /nonce_str="([^"]+)"/.exec(auth)![1]
      const signature = /signature="([^"]+)"/.exec(auth)![1]
      expect(
        verify(
          'RSA-SHA256',
          Buffer.from(
            `POST\n/v3/test\n${timestamp}\n${nonce}\n${options.data}\n`,
          ),
          keys.publicKey,
          Buffer.from(signature, 'base64'),
        ),
      ).toBe(true)
      return { status: 204, data: '', headers: {} }
    })
    await expect(
      client.request('POST', '/v3/test', { text: '花' }),
    ).resolves.toEqual({})
    request.mockResolvedValue({ status: 200, data: '{}', headers: {} })
    await expect(client.request('GET', '/v3/test')).resolves.toEqual({})
  })
})
