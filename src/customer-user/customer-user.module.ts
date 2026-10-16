import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { CustomerUserController } from './customer-user.controller'
import { CustomerUserRepository } from './customer-user.repository'
import { CustomerUserService } from './customer-user.service'

@Module({
  imports: [AdminModule],
  controllers: [CustomerUserController],
  providers: [CustomerUserRepository, CustomerUserService, AdminAuthGuard],
})
export class CustomerUserModule {}
