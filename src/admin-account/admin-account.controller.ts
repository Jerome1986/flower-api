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
} from '@nestjs/common'
import type { AdminRequest } from '../common/guards/admin-auth.guard'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { AdminAccountService } from './admin-account.service'
import { AdminAccountQueryDto } from './dto/admin-account-query.dto'
import { AdminAccountStatusDto } from './dto/admin-account-status.dto'
import { CreateAdminAccountDto } from './dto/create-admin-account.dto'
import { ResetAdminPasswordDto } from './dto/reset-admin-password.dto'
import { SaveAdminAccountDto } from './dto/save-admin-account.dto'

// 管理员账号接口入口。
@Controller('admin/accounts')
@UseGuards(AdminAuthGuard)
export class AdminAccountController {
  // 注入后台账号管理服务。
  constructor(
    // 当前模块业务服务。
    private readonly service: AdminAccountService,
  ) {}

  // 分页查询后台账号。
  @Get()
  list(
    // 列表查询条件。
    @Query() query: AdminAccountQueryDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 分页查询后台账号。
    return this.service.list(query, req.admin)
  }

  // 查询后台账号详情。
  @Get(':id')
  detail(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 查询后台账号详情。
    return this.service.detail(id, req.admin)
  }

  // 新增平台后台账号。
  @Post()
  create(
    // 接口请求参数。
    @Body() dto: CreateAdminAccountDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 新增平台后台账号。
    return this.service.create(dto, req.admin)
  }

  // 编辑账号基本信息和角色。
  @Patch(':id')
  update(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: SaveAdminAccountDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 编辑账号基本信息和角色。
    return this.service.update(id, dto, req.admin)
  }

  // 启用或停用后台账号。
  @Patch(':id/status')
  status(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: AdminAccountStatusDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 启用或停用后台账号。
    return this.service.status(id, dto.status, req.admin)
  }

  // 重置后台账号的登录密码。
  @Patch(':id/password')
  password(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: ResetAdminPasswordDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.service.resetPassword(id, dto.password, req.admin)
  }
}
