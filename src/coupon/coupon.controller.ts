import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import type { UserRequest } from '../user-auth/user-auth.types'
import { CouponService } from './coupon.service'

// 用户优惠券数据与处理逻辑。
@Controller('coupon')
@UseGuards(UserAuthGuard)
export class CouponCountroller {
  // 注入本模块所需的业务依赖。
  constructor(
    // 当前模块业务服务。
    private readonly service: CouponService,
  ) {}

  // 获取指定用户优惠券
  @Get(':userId')
  userCoupon(
    // 用户编号。
    @Param('userId', ParseIntPipe) userId: number,
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
  ) {
    // 1. 不满足要求时提示：不能查看其他用户的优惠券。
    if (userId !== req.userId)
      throw new ForbiddenException('不能查看其他用户的优惠券')
    // 2. 查询当前用户的优惠券。
    return this.service.userCoupon(req.userId)
  }
}
