import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { MarketingActivityController } from './marketing-activity.controller';
import { MarketingActivityRepository } from './marketing-activity.repository';
import { MarketingActivityService } from './marketing-activity.service';
@Module({
  imports: [AdminModule],
  controllers: [MarketingActivityController],
  providers: [
    MarketingActivityRepository,
    MarketingActivityService,
    AdminAuthGuard,
  ],
})
export class MarketingActivityModule {}
