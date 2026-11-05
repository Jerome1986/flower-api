import { createDecipheriv } from 'node:crypto'

// 验签后使用 APIv3 密钥解密通知，认证标签为密文末尾 16 字节。
export const decryptWechatData = (resource: {
  nonce: string; ciphertext: string; associated_data?: string
}, key: string) => {
  if (typeof resource.nonce !== 'string' || Buffer.byteLength(resource.nonce) !== 12 ||
      typeof resource.ciphertext !== 'string') throw new Error('通知资源无效')
  const data = Buffer.from(resource.ciphertext, 'base64')
  if (data.length <= 16) throw new Error('通知密文无效')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), resource.nonce)
  decipher.setAuthTag(data.subarray(-16))
  decipher.setAAD(Buffer.from(resource.associated_data ?? ''))
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]).toString('utf8'))
}
