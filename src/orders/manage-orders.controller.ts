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

// 订单接口入口。
@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
export class ManageOrdersController {
  // 注入订单业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: ManageOrdersService,
  ) {}

  // 查询当前可访问的门店。
  @Get('stores')
  stores(
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 查询当前可访问的门店。
    return this.service.stores(req.admin)
  }

  // 查询订单列表。
  @Get()
  list(
    // 列表查询条件。
    @Query() query: OrderQuery,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 查询订单列表。
    return this.service.list(query, req.admin)
  }

  // 查询订单详情。
  @Get(':orderNo')
  detail(
    // 业务订单编号。
    @Param('orderNo') no: string,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 查询订单详情。
    return this.service.detail(no, req.admin)
  }

  // 校验订单状态及版本，执行履约操作。
  @Post(':orderNo/actions')
  @HttpCode(200)
  action(
    // 业务订单编号。
    @Param('orderNo') no: string,
    // 接口请求参数。
    @Body() dto: OrderAction,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 校验订单状态及版本，执行履约操作。
    return this.service.action(no, dto, req.admin)
  }
}
