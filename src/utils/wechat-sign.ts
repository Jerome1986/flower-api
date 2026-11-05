import { constants, sign as rsaSign, type KeyObject } from 'node:crypto'

// 微信 v3 请求和小程序调起签名，原文末尾必须保留换行。
export class WechatSign {
  constructor(private readonly privateKey: KeyObject) {}

  signRequest(method: string, path: string, timestamp: string, nonce: string, body: string) {
    return this.sign(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`)
  }

  signClient(appid: string, timestamp: string, nonce: string, packageValue: string) {
    return this.sign(`${appid}\n${timestamp}\n${nonce}\n${packageValue}\n`)
  }

  private sign(value: string) {
    return rsaSign('RSA-SHA256', Buffer.from(value), {
      key: this.privateKey, padding: constants.RSA_PKCS1_PADDING,
    }).toString('base64')
  }
}
