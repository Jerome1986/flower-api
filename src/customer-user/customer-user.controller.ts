import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { AdminRequest } from '../common/guards/admin-auth.guard'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { CustomerUserService } from './customer-user.service'
import { CustomerUserQueryDto } from './dto/customer-user-query.dto'
import { CustomerUserStatusDto } from './dto/customer-user-status.dto'
// 客户用户接口入口。
@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class CustomerUserController {
  // 注入客户业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: CustomerUserService,
  ) {}

  // 查询客户列表。
  @Get()
  list(
    // 列表查询条件。
    @Query() query: CustomerUserQueryDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 查询客户列表。
    return this.service.list(query, req.admin)
  }

  // 查询客户详情。
  @Get(':id')
  detail(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 查询客户详情。
    return this.service.detail(id, req.admin)
  }

  // 设置客户启用状态。
  @Patch(':id/status')
  status(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: CustomerUserStatusDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 设置客户启用状态。
    return this.service.status(id, dto.status, req.admin)
  }
}
