import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import { type UserRequest } from '../user-auth/user-auth.types'
import { CreateOrderDto } from './dto/create-order.dto'
import { QuoteOrderDto } from './dto/quote-order.dto'
import { OrdersService } from './orders.service'

// 订单接口入口。
@Controller('user/orders')
@UseGuards(UserAuthGuard)
export class OrdersController {
  // 注入订单业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: OrdersService,
  ) {}

  // 筛选当前订单可使用的优惠券。
  @Post('available-coupons')
  @HttpCode(200)
  availableCoupons(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: QuoteOrderDto,
  ) {
    // 1. 筛选当前订单可使用的优惠券。
    return this.service.availableCoupons(req.userId, dto)
  }

  // 校验选择的商品并返回订单报价。
  @Post('quote')
  @HttpCode(200)
  quote(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: QuoteOrderDto,
  ) {
    // 1. 校验选择的商品并返回订单报价。
    return this.service.quote(req.userId, dto)
  }

  // 新增订单。
  @Post()
  create(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: CreateOrderDto,
  ) {
    // 1. 新增订单。
    return this.service.create(req.userId, dto)
  }

  // 查询订单列表。
  @Get()
  list(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
  ) {
    // 1. 查询订单列表。
    return this.service.list(req.userId)
  }

  // 查询订单详情。
  @Get(':orderNo')
  detail(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 业务订单编号。
    @Param('orderNo') no: string,
  ) {
    // 1. 查询订单详情。
    return this.service.detail(req.userId, no)
  }

  // 取消订单，按支付状态执行关单或退款。
  @Post(':orderNo/cancel')
  @HttpCode(200)
  cancel(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 业务订单编号。
    @Param('orderNo') no: string,
  ) {
    // 1. 按付款状态取消订单并处理库存和退款。
    return this.service.cancel(req.userId, no)
  }
}
