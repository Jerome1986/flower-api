import { randomInt } from 'node:crypto'

const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/** 随机生成六位门店编号，至少包含一个大写字母和一个数字。唯一性由数据库约束及创建时重试保证。 */
export function generateStoreCode(): string {
  let code: string
  do {
    code = Array.from(
      { length: 6 },
      () => CHARACTERS[randomInt(CHARACTERS.length)],
    ).join('')
  } while (!/[A-Z]/.test(code) || !/[0-9]/.test(code))
  return code
}
