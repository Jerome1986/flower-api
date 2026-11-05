import { ConflictException } from '@nestjs/common'
import { Prisma, type UserCoupon } from '@prisma/client'

// 只抵商品金额，配送费不参加优惠；规则读取已发券快照。
export function couponDiscount(
  // 用户优惠券信息。
  coupon: UserCoupon,
  // 用户编号。
  userId: number,
  // 商品规格编号。
  specId: number,
  // 商品份数。
  quantity: number,
  // 商品单价。
  unitPrice: number,
  // 当前时间。
  now = new Date(),
) {
  // 1. 不满足要求时提示：优惠券已失效或不可用。
  if (
    coupon.userId !== userId ||
    coupon.status !== 'AVAILABLE' ||
    coupon.currentOrderId !== null ||
    coupon.expiresAt <= now
  )
    throw new ConflictException('优惠券已失效或不可用，请重新选择')
  // 2. 根据优惠券状态选择处理分支。
  if (coupon.type === 'CASH') {
    // 业务金额。
    const amount = Math.round(Number(coupon.cashAmount) * 100)
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new ConflictException('优惠券配置异常')
    return Math.min(unitPrice * quantity, amount)
  }
  // 3. 不满足要求时提示：当前商品规格或数量不适用此优惠券。
  if (
    coupon.exchangeSpecId !== specId ||
    !Number.isSafeInteger(coupon.exchangeQuantity) ||
    (coupon.exchangeQuantity ?? 0) <= 0 ||
    coupon.exchangeQuantity! > quantity
  )
    throw new ConflictException('当前商品规格或数量不适用此优惠券')
  // 4. 返回本次处理结果。
  return unitPrice * coupon.exchangeQuantity!
}

// 核销确认履约订单使用的优惠券。
export async function consumeCoupon(
  // 当前数据库事务。
  tx: Prisma.TransactionClient,
  // 用户优惠券信息。
  coupon: UserCoupon,
  // 用户编号。
  userId: number,
  // 订单编号。
  orderId: number,
  // 不同确认流程使用各自的流水说明。
  remark = '零元订单确认用券',
) {
  // 1. 记录更新结果：本次处理结果。
  const result = await tx.userCoupon.updateMany({
    where: {
      id: coupon.id,
      userId,
      status: 'AVAILABLE',
      currentOrderId: null,
      expiresAt: { gt: new Date() },
    },
    data: { status: 'USED', currentOrderId: orderId, usedAt: new Date() },
  })
  // 2. 不满足要求时提示：优惠券已被使用。
  if (result.count !== 1)
    throw new ConflictException('优惠券已被使用，请重新选择')
  // 3. 保存本次业务数据变更。
  await tx.couponEvent.create({
    data: {
      couponId: coupon.id,
      orderId,
      type: 'USED',
      operationKey: `used:${orderId}`,
      remark,
    },
  })
}

// 取消订单后按原有效期返还优惠券。
export async function returnCoupon(
  // 当前数据库事务。
  tx: Prisma.TransactionClient,
  // 用户优惠券编号。
  couponId: number,
  // 用户编号。
  userId: number,
  // 订单编号。
  orderId: number,
) {
  // 1. 查询用户优惠券信息。
  const coupon = await tx.userCoupon.findUnique({ where: { id: couponId } })
  // 2. 不满足要求时提示：优惠券使用记录异常。
  if (
    !coupon ||
    coupon.userId !== userId ||
    coupon.currentOrderId !== orderId ||
    !['USED', 'LOCKED'].includes(coupon.status)
  )
    throw new ConflictException('优惠券使用记录异常，请联系管理员')
  // 3. 记录更新结果：本次处理结果。
  const result = await tx.userCoupon.updateMany({
    where: {
      id: couponId,
      userId,
      currentOrderId: orderId,
      status: coupon.status,
    },
    data: {
      status: coupon.expiresAt > new Date() ? 'AVAILABLE' : 'EXPIRED',
      currentOrderId: null,
      usedAt: null,
    },
  })
  // 4. 不满足要求时提示：优惠券状态已变化。
  if (result.count !== 1)
    throw new ConflictException('优惠券状态已变化，请重试')
  // 5. 保存本次业务数据变更。
  await tx.couponEvent.create({
    data: {
      couponId,
      orderId,
      type: coupon.status === 'LOCKED' ? 'RELEASED' : 'RETURNED',
      operationKey: `returned:${orderId}`,
      remark: '取消或关闭订单返券，不延长有效期',
    },
  })
}

// 为待支付订单锁定优惠券。
export async function lockCoupon(
  // 当前数据库事务。
  tx: Prisma.TransactionClient,
  // 用户优惠券信息。
  coupon: UserCoupon,
  // 用户编号。
  userId: number,
  // 订单编号。
  orderId: number,
) {
  // 1. 记录更新结果：本次处理结果。
  const result = await tx.userCoupon.updateMany({
    where: {
      id: coupon.id,
      userId,
      status: 'AVAILABLE',
      currentOrderId: null,
      expiresAt: { gt: new Date() },
    },
    data: { status: 'LOCKED', currentOrderId: orderId },
  })
  // 2. 不满足要求时提示：优惠券已被占用。
  if (result.count !== 1)
    throw new ConflictException('优惠券已被占用，请重新选择')
  // 3. 保存本次业务数据变更。
  await tx.couponEvent.create({
    data: {
      couponId: coupon.id,
      orderId,
      type: 'LOCKED',
      operationKey: `locked:${orderId}`,
      remark: '待支付订单占用优惠券',
    },
  })
}
