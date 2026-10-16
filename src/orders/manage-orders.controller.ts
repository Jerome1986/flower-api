import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  AdminAuthGuard,
  type AdminRequest,
} from '../common/guards/admin-auth.guard'
import { OrderAction } from './dto/order-action.dto'
import { OrderQuery } from './dto/order-query.dto'
import { ManageOrdersService } from './manage-orders.service'

@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
export class ManageOrdersController {
  // 注入订单业务服务，统一处理接口请求。
  constructor(private readonly service: ManageOrdersService) {}

  // 查询当前可访问的门店。
  @Get('stores')
  stores(@Req() req: AdminRequest) {
    return this.service.stores(req.admin)
  }

  // 查询订单列表。
  @Get()
  list(@Query() query: OrderQuery, @Req() req: AdminRequest) {
    return this.service.list(query, req.admin)
  }

  // 查询订单详情。
  @Get(':orderNo')
  detail(@Param('orderNo') no: string, @Req() req: AdminRequest) {
    return this.service.detail(no, req.admin)
  }

  // 校验订单状态及版本，执行履约操作。
  @Post(':orderNo/actions')
  @HttpCode(200)
  action(
    @Param('orderNo') no: string,
    @Body() dto: OrderAction,
    @Req() req: AdminRequest,
  ) {
    return this.service.action(no, dto, req.admin)
  }
}
