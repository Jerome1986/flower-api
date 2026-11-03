import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { StoreController } from './store.controller'
import { StoreRepository } from './store.repository'
import { StoreService } from './store.service'

// 门店模块依赖注册。
@Module({
  imports: [AdminModule],
  controllers: [StoreController],
  providers: [StoreRepository, StoreService, AdminAuthGuard],
})
export class StoreModule {}
