import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { UserAuthController } from './user-auth.controller'
import { UserAuthGuard } from './user-auth.guard'
import { UserAuthRepository } from './user-auth.repository'
import { UserAuthService } from './user-auth.service'
import { WxUtil } from '../utils/wx.util'
import { CouponModule } from '../coupon/coupon.module'

@Module({
  imports: [AdminModule, CouponModule],
  controllers: [UserAuthController],
  providers: [UserAuthRepository, UserAuthService, UserAuthGuard, WxUtil],
  exports: [UserAuthService, UserAuthGuard, AdminModule],
})
export class UserAuthModule {}
