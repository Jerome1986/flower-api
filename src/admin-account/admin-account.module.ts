import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminAccountController } from './admin-account.controller';
import { AdminAccountService } from './admin-account.service';
@Module({
  imports: [AdminModule],
  controllers: [AdminAccountController],
  providers: [AdminAccountService, AdminAuthGuard],
})
export class AdminAccountModule {}
