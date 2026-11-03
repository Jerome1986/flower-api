import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { MarketingActivityController } from './marketing-activity.controller'
import { MarketingActivityRepository } from './marketing-activity.repository'
import { MarketingActivityService } from './marketing-activity.service'
import { CouponModule } from '../coupon/coupon.module'
import { UserAuthModule } from '../user-auth/user-auth.module'
import { NewUserGiftController } from './new-user-gift.controller'
// 营销活动模块依赖注册。
@Module({
  imports: [AdminModule, CouponModule, UserAuthModule],
  controllers: [MarketingActivityController, NewUserGiftController],
  providers: [
    MarketingActivityRepository,
    MarketingActivityService,
    AdminAuthGuard,
  ],
})
export class MarketingActivityModule {}
