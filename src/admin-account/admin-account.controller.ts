import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AdminRequest } from '../common/guards/admin-auth.guard';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { AdminAccountService } from './admin-account.service';
import { AdminAccountQueryDto } from './dto/admin-account-query.dto';
import { AdminAccountStatusDto } from './dto/admin-account-status.dto';
import { CreateAdminAccountDto } from './dto/create-admin-account.dto';
import { ResetAdminPasswordDto } from './dto/reset-admin-password.dto';
import { SaveAdminAccountDto } from './dto/save-admin-account.dto';

@Controller('admin/accounts')
@UseGuards(AdminAuthGuard)
export class AdminAccountController {
  // 注入后台账号管理服务。
  constructor(private readonly service: AdminAccountService) {}

  // 分页查询后台账号。
  @Get()
  list(@Query() query: AdminAccountQueryDto, @Req() req: AdminRequest) {
    return this.service.list(query, req.admin);
  }

  // 查询后台账号详情。
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: AdminRequest) {
    return this.service.detail(id, req.admin);
  }

  // 新增平台后台账号。
  @Post()
  create(@Body() dto: CreateAdminAccountDto, @Req() req: AdminRequest) {
    return this.service.create(dto, req.admin);
  }

  // 编辑账号基本信息和角色。
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveAdminAccountDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.update(id, dto, req.admin);
  }

  // 启用或停用后台账号。
  @Patch(':id/status')
  status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdminAccountStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.status(id, dto.status, req.admin);
  }

  // 重置后台账号的登录密码。
  @Patch(':id/password')
  password(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetAdminPasswordDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.resetPassword(id, dto.password, req.admin);
  }
}
