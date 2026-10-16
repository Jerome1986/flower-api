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
@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class CustomerUserController {
  // 注入客户业务服务，统一处理接口请求。
  constructor(private readonly service: CustomerUserService) {}

  // 查询客户列表。
  @Get()
  list(@Query() query: CustomerUserQueryDto, @Req() req: AdminRequest) {
    return this.service.list(query, req.admin)
  }

  // 查询客户详情。
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: AdminRequest) {
    return this.service.detail(id, req.admin)
  }

  // 设置客户启用状态。
  @Patch(':id/status')
  status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CustomerUserStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.status(id, dto.status, req.admin)
  }
}
