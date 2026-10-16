import { Module } from '@nestjs/common'
import { CouponGrantService } from './coupon-grant.service'
import { CouponRepository } from './coupon.repository'

@Module({
  providers: [CouponRepository, CouponGrantService],
  exports: [CouponGrantService],
})
export class CouponModule {}
