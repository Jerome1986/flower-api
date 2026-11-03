import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { StoreProductController } from './store-product.controller'
import { StoreProductRepository } from './store-product.repository'
import { StoreProductService } from './store-product.service'
// 门店商品模块依赖注册。
@Module({
  imports: [AdminModule],
  controllers: [StoreProductController],
  providers: [StoreProductRepository, StoreProductService, AdminAuthGuard],
})
export class StoreProductModule {}
