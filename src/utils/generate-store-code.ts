import { randomInt } from 'node:crypto'

// 门店编号可选字符。
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** 随机生成六位门店编号，至少包含一个大写字母和一个数字。唯一性由数据库约束及创建时重试保证。 */
export function generateStoreCode(): string {
  // 1. 准备业务编号或错误码。
  let code: string
  do {
    code = Array.from(
      { length: 6 },
      () => CHARACTERS[randomInt(CHARACTERS.length)],
    ).join('')
  } while (!/[A-Z]/.test(code) || !/[0-9]/.test(code))
  // 2. 返回本次处理结果。
  return code
}
