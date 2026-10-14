import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { TestLoginDto } from './dto/test-login.dto';
import { UserAuthGuard } from './user-auth.guard';
import { UserAuthService } from './user-auth.service';
import type { UserRequest } from './user-auth.types';

@Controller('user')
export class UserAuthController {
  // 注入用户身份业务服务，统一处理接口请求。
  constructor(private readonly service: UserAuthService) {}

  // 处理用户登录。
  @Post('test-login')
  login(@Body() dto: TestLoginDto) {
    return this.service.testLogin(dto.phone);
  }

  // 读取当前登录用户信息。
  @Get('me')
  @UseGuards(UserAuthGuard)
  me(@Req() req: UserRequest) {
    return this.service.currentUser(req.userId);
  }
}
