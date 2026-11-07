import { Injectable } from '@nestjs/common'
import { CouponRepository } from './coupon.repository'

// 用户优惠券业务服务。
@Injectable()
export class CouponService {
  // 注入本模块所需的业务依赖。
  constructor(
    // 业务数据访问层。
    private readonly repo: CouponRepository,
  ) {}

  // 获取指定用户优惠券
  userCoupon(
    // 用户编号。
    userId: number,
  ) {
    // 1. 查询当前用户的优惠券。
    return this.repo.userCoupon(userId)
  }
}
