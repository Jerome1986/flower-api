import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { CouponTemplateController } from './coupon-template.controller'
import { CouponTemplateRepository } from './coupon-template.repository'
import { CouponTemplateService } from './coupon-template.service'
@Module({
  imports: [AdminModule],
  controllers: [CouponTemplateController],
  providers: [CouponTemplateRepository, CouponTemplateService, AdminAuthGuard],
})
export class CouponTemplateModule {}
