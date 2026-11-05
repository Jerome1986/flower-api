import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import type { UserRequest } from '../user-auth/user-auth.types'
import { InvitationService } from './invitation.service'

// 当前登录用户的邀请活动查询。
@Controller('user/invitations')
@UseGuards(UserAuthGuard)
export class InvitationController {
  constructor(private readonly service: InvitationService) {}

  // 查询本人邀请码、奖励规则及邀请记录。
  @Get()
  summary(@Req() req: UserRequest) {
    return this.service.summary(req.userId)
  }
}
