import { createCipheriv, generateKeyPairSync, verify, sign } from 'node:crypto'
import axios from 'axios'
import { WechatPayClient, WxApiError } from './wechat-pay.client'
jest.mock('axios')

describe('微信 V3 加密与商户签名边界', () => {
  test('微信错误响应必须验签；缺签名不能成为可信错误状态', async () => {
    const request = axios.request as jest.Mock
    request.mockResolvedValue({
      status: 404,
      data: '{"code":"ORDER_NOT_EXIST"}',
      headers: headers('{"code":"ORDER_NOT_EXIST"}'),
    })
    await expect(client.request('GET', '/v3/test')).rejects.toBeInstanceOf(WxApiError)
    request.mockResolvedValue({
      status: 404,
      data: '{"code":"ORDER_NOT_EXIST"}',
      headers: { 'wechatpay-signature': 'bad' },
    })
    await expect(client.request('GET', '/v3/test')).rejects.toThrow('签名验证失败')
  })
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const headers = (body: string) => {
    const timestamp = String(Math.floor(Date.now() / 1000)), nonce = 'nonce'
    return { 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce, 'wechatpay-serial': 'key-id',
      'wechatpay-signature': sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), keys.privateKey).toString('base64') }
  }
  const cfg = {
    APPID: 'app',
    MCH_ID: 'merchant',
    SERIALNO: 'serial',
    API_V3_KEY: 'a'.repeat(32),
    privateKey: keys.privateKey,
  }
  let client: WechatPayClient
  beforeEach(() => {
    process.env.WECHATPAY_PUBLIC_KEY_ID = 'key-id'
    process.env.WECHATPAY_PUBLIC_KEY = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
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
      expect(options.proxy).toBe(false)
      return { status: 204, data: '', headers: headers('') }
    })
    await expect(
      client.request('POST', '/v3/test', { text: '花' }),
    ).resolves.toEqual({})
    request.mockResolvedValue({ status: 200, data: '{}', headers: headers('{}') })
    await expect(client.request('GET', '/v3/test')).resolves.toEqual({})
  })
  test('原始报文签名、时间、公钥编号和缺失头严格校验', () => {
    const raw = '{ "event": "test" }'
    const valid = headers(raw)
    expect(() => client.verifyMessage(Buffer.from(raw), valid)).not.toThrow()
    expect(() => client.verifyMessage(raw + ' ', valid)).toThrow('签名验证失败')
    expect(() => client.verifyMessage(raw, { ...valid, 'wechatpay-serial': 'unknown' })).toThrow('签名验证失败')
    expect(() => client.verifyMessage(raw, { ...valid, 'wechatpay-timestamp': '1000000000' })).toThrow('签名验证失败')
    expect(() => client.verifyMessage(undefined, valid)).toThrow('签名验证失败')
    expect(() => client.verifyMessage(raw, {})).toThrow('签名验证失败')
  })
})
