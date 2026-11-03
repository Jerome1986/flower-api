import { Module } from '@nestjs/common'
import { CouponGrantService } from './coupon-grant.service'
import { CouponRepository } from './coupon.repository'
import { CouponCountroller } from './coupon.controller'
import { CouponService } from './coupon.service'
import { UserAuthModule } from '../user-auth/user-auth.module'

// 用户优惠券模块依赖注册。
@Module({
  imports: [UserAuthModule],
  controllers: [CouponCountroller],
  providers: [CouponRepository, CouponGrantService, CouponService],
  exports: [CouponGrantService],
})
export class CouponModule {}
