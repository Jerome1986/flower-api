import { Module } from '@nestjs/common'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { OrdersModule } from '../orders/orders.module'
import { UserAuthModule } from '../user-auth/user-auth.module'
import {
  BouquetsController,
  CustomOrdersAdminController,
  CustomOrdersController,
  CustomSettingsController,
} from './bouquets.controller'
import { BouquetsRepository } from './bouquets.repository'
import { BouquetsService } from './bouquets.service'
// 定制花束模块依赖注册。
@Module({
  imports: [UserAuthModule, OrdersModule],
  controllers: [
    BouquetsController,
    CustomOrdersController,
    CustomOrdersAdminController,
    CustomSettingsController,
  ],
  providers: [BouquetsRepository, BouquetsService, AdminAuthGuard],
})
export class BouquetsModule {}
