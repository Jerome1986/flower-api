import { BadRequestException } from '@nestjs/common'

// 元转换为安全整数分，金额仅接受服务端订单计算结果。
export const yuanToFen = (amount: unknown) => {
  const value = Math.round(Number(amount) * 100)
  if (!Number.isSafeInteger(value) || value <= 0 || value > 999999999)
    throw new BadRequestException('支付金额无效')
  return value
}
