import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { AdminModule } from '../admin/admin.module';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';

@Module({
  imports: [AdminModule],
  controllers: [StoreController],
  providers: [StoreService, AdminAuthGuard],
})
export class StoreModule {}
