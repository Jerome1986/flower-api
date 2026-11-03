import { Body, Controller, Post } from '@nestjs/common'
import { AdminService } from './admin.service'
import { LoginAdminDto } from './dto/login-admin.dto'

// 管理员身份接口入口。
@Controller('admin')
export class AdminController {
  // 注入后台登录服务，账号新增统一通过受鉴权保护的账号管理接口。
  constructor(
    // 管理员身份业务服务。
    private readonly adminService: AdminService,
  ) {}

  // 管理员登录
  @Post('login')
  adminLogin(
    // 管理员登录参数。
    @Body() loginAdminDto: LoginAdminDto,
  ) {
    // 1. 返回本次处理结果。
    return this.adminService.login(loginAdminDto)
  }
}
