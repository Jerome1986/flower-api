import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { CouponGrantService } from '../coupon/coupon-grant.service'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import type { UserRequest } from '../user-auth/user-auth.types'

// 营销活动接口入口。
@Controller('marketing-activities/new-user-gift')
@UseGuards(UserAuthGuard)
export class NewUserGiftController {
  // 注入本模块所需的业务依赖。
  constructor(
    // 赠花汇总结果。
    private readonly gifts: CouponGrantService,
  ) {}

  // 查询或更新营销活动状态。
  @Get('status')
  status(
    // 订单取消申请日志。
    @Req() request: UserRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.gifts.newUserStatus(request.userId)
  }

  // 领取当前用户的新人花礼。
  @Post('claim')
  claim(
    // 订单取消申请日志。
    @Req() request: UserRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.gifts.claimNewUser(request.userId)
  }
}
