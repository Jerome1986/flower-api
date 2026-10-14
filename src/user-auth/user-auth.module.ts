import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { UserAuthController } from './user-auth.controller';
import { UserAuthGuard } from './user-auth.guard';
import { UserAuthRepository } from './user-auth.repository';
import { UserAuthService } from './user-auth.service';

@Module({
  imports: [AdminModule],
  controllers: [UserAuthController],
  providers: [UserAuthRepository, UserAuthService, UserAuthGuard],
  exports: [UserAuthService, UserAuthGuard, AdminModule],
})
export class UserAuthModule {}
