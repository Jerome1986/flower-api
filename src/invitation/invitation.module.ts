import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { InvitationController } from './invitation.controller'
import { InvitationRepository } from './invitation.repository'
import { InvitationService } from './invitation.service'

// 依赖令牌模块，避免邀请奖励与登录模块相互引用。
@Module({
  imports: [AdminModule],
  controllers: [InvitationController],
  providers: [InvitationRepository, InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
