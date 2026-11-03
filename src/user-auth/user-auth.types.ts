import type { Request } from 'express'

// 用户身份接口数据结构。
export interface UserRequest extends Request {
  // 用户编号。
  userId: number
}
