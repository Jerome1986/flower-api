import {
  Body,
  Controller,
  Get,
  Put,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { TestLoginDto } from './dto/test-login.dto'
import { UserAuthGuard } from './user-auth.guard'
import { UserAuthService } from './user-auth.service'
import type { UserRequest } from './user-auth.types'
import { WxPhoneLoginDto } from './dto/wx-phone-login.dto'

// 用户身份接口入口。
@Controller('user')
export class UserAuthController {
  // 注入用户身份业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: UserAuthService,
  ) {}

  // 处理用户登录。
  @Post('test-login')
  login(
    // 接口请求参数。
    @Body() dto: TestLoginDto,
  ) {
    // 1. 返回本次处理结果。
    return this.service.testLogin(dto.phone)
  }

  // 微信手机号登录
  @Post('wx-login')
  wxLogin(
    // 接口请求参数。
    @Body() dto: WxPhoneLoginDto,
  ) {
    // 1. 微信手机号登录。
    return this.service.wxLogin(dto)
  }

  // 读取当前登录用户信息。
  @Put('me')
  @UseGuards(UserAuthGuard)
  updateProfile(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: UpdateProfileDto,
  ) {
    // 1. 保存当前用户的资料。
    return this.service.updateProfile(req.userId, dto)
  }

  // 返回当前登录用户资料。
  @Get('me')
  @UseGuards(UserAuthGuard)
  me(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
  ) {
    // 1. 校验用户状态并返回当前资料。
    return this.service.currentUser(req.userId)
  }
}
