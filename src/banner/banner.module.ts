import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { BannerController, HomeBannerController } from './banner.controller'
import { BannerRepository } from './banner.repository'
import { BannerService } from './banner.service'
@Module({
  imports: [AdminModule],
  controllers: [BannerController, HomeBannerController],
  providers: [BannerRepository, BannerService, AdminAuthGuard],
})
export class BannerModule {}
