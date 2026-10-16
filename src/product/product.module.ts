import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { ProductController } from './product.controller'
import { ProductRepository } from './product.repository'
import { ProductService } from './product.service'

@Module({
  imports: [AdminModule],
  controllers: [ProductController],
  providers: [ProductRepository, ProductService, AdminAuthGuard],
})
export class ProductModule {}
