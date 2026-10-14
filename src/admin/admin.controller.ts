import { Body, Controller, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { LoginAdminDto } from './dto/login-admin.dto';

@Controller('admin')
export class AdminController {
  // 注入后台登录服务，账号新增统一通过受鉴权保护的账号管理接口。
  constructor(private readonly adminService: AdminService) {}

  // 管理员登录
  @Post('login')
  adminLogin(@Body() loginAdminDto: LoginAdminDto) {
    return this.adminService.login(loginAdminDto);
  }
}
