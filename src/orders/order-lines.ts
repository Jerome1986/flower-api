import { BadRequestException, ConflictException } from '@nestjs/common'
import type { UserCoupon } from '@prisma/client'
import type { QuoteOrderDto } from './dto/quote-order.dto'

// 订单接口数据结构。
export interface OrderLineInput {
  // 商品编号。
  productId: number
  // 商品规格编号。
  specId: number
  // 商品份数。
  quantity: number
  // 备注内容。
  remark?: string
}
// 兼容单商品参数并校验订单明细。
export function orderLines(
  // 接口请求参数。
  dto: QuoteOrderDto,
): OrderLineInput[] {
  // 1. 禁止同时提交商品数组和旧版单商品字段。
  if (
    dto.items !== undefined &&
    [dto.productId, dto.specId, dto.quantity].some((v) => v !== undefined)
  )
    throw new BadRequestException('商品数组与单商品参数不能同时传入')
  // 2. 统一为商品明细数组并限制明细条数。
  const lines = dto.items ?? [
    {
      productId: dto.productId!,
      specId: dto.specId!,
      quantity: dto.quantity!,
      remark: '',
    },
  ]
  if (!Array.isArray(lines) || !lines.length || lines.length > 100)
    throw new BadRequestException('请选择1至100条商品')
  // 3. 校验商品、规格、份数和备注并规范化字段。
  const normalized = lines.map((line) => {
    if (
      ![line.productId, line.specId, line.quantity].every(
        (v) => Number.isSafeInteger(v) && v > 0,
      ) ||
      line.quantity > 999
    )
      throw new BadRequestException('商品或数量无效')
    if (
      line.remark != null &&
      (typeof line.remark !== 'string' || line.remark.length > 500)
    )
      throw new BadRequestException('商品备注无效')
    return {
      productId: line.productId,
      specId: line.specId,
      quantity: line.quantity,
      remark: line.remark?.trim() || '',
    }
  })
  // 4. 按规格汇总份数，防止拆分明细绕过数量限制。
  const totals = new Map<number, number>()
  for (const line of normalized)
    totals.set(line.specId, (totals.get(line.specId) || 0) + line.quantity)
  if ([...totals.values()].some((v) => v > 999))
    throw new BadRequestException('同规格商品合计不能超过999份')
  // 5. 返回校验后的商品明细。
  return normalized
}
// 将优惠金额和兑换份数分配到商品明细。
export function allocateCoupon(
  // 用户优惠券信息。
  coupon: UserCoupon | null,
  // 用户编号。
  userId: number,
  // 订单商品明细。
  lines: {
    // 商品规格编号。
    specId: number
    // 商品份数。
    quantity: number
    // 商品单价。
    unitPrice: number
  }[],
) {
  // 1. 初始化每条商品明细的优惠金额和兑换份数。
  const discounts = lines.map(() => 0),
    exchanges = lines.map(() => 0)
  // 2. 未选优惠券时直接返回零优惠。
  if (!coupon) return { discounts, exchanges, discountAmount: 0 }
  // 3. 校验优惠券归属、可用状态和有效期。
  if (
    coupon.userId !== userId ||
    coupon.status !== 'AVAILABLE' ||
    coupon.currentOrderId !== null ||
    coupon.expiresAt <= new Date()
  )
    throw new ConflictException('优惠券已失效或不可用，请重新选择')
  // 4. 计算各条商品明细的原价金额。
  const amounts = lines.map((line) => line.quantity * line.unitPrice)
  // 5. 现金券按商品金额分摊，并分配整数分尾差。
  if (coupon.type === 'CASH') {
    // 现金券抵扣金额（分）。
    const cash = Math.round(Number(coupon.cashAmount) * 100)
    if (!Number.isSafeInteger(cash) || cash <= 0)
      throw new ConflictException('优惠券配置异常')
    // 订单明细的商品总金额。
    const total = amounts.reduce((sum, value) => sum + value, 0)
    // 本次实际抵扣金额。
    const discount = Math.min(total, cash)
    amounts.forEach((amount, i) => {
      discounts[i] = total
        ? Number((BigInt(discount) * BigInt(amount)) / BigInt(total))
        : 0
    })
    // 优惠分摊后的尾差（分）。
    let remainder = discount - discounts.reduce((sum, value) => sum + value, 0)
    // 逐项处理：当前明细索引。
    for (let i = 0; remainder > 0 && i < lines.length; i++)
      if (discounts[i] < amounts[i]) {
        discounts[i]++
        remainder--
      }
  } else {
    // 尚未分配的兑换份数。
    // 6. 兑换券按指定规格分配可兑换份数。
    let remaining = coupon.exchangeQuantity || 0
    if (!Number.isSafeInteger(remaining) || remaining <= 0)
      throw new ConflictException('兑换券配置异常')
    lines.forEach((line, i) => {
      if (line.specId !== coupon.exchangeSpecId) return
      exchanges[i] = Math.min(remaining, line.quantity)
      discounts[i] = exchanges[i] * line.unitPrice
      remaining -= exchanges[i]
    })
    if (remaining) throw new ConflictException('商品规格或数量不适用此优惠券')
  }
  // 7. 汇总明细优惠并返回最终抵扣金额。
  return {
    discounts,
    exchanges,
    discountAmount: discounts.reduce((sum, value) => sum + value, 0),
  }
}
