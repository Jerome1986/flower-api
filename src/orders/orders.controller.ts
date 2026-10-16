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

@Controller('user/orders')
@UseGuards(UserAuthGuard)
export class OrdersController {
  // 注入订单业务服务，统一处理接口请求。
  constructor(private readonly service: OrdersService) {}

  // 校验选择的商品并返回订单报价。
  @Post('quote')
  @HttpCode(200)
  quote(@Req() req: UserRequest, @Body() dto: QuoteOrderDto) {
    return this.service.quote(req.userId, dto)
  }

  // 新增订单。
  @Post()
  create(@Req() req: UserRequest, @Body() dto: CreateOrderDto) {
    return this.service.create(req.userId, dto)
  }

  // 查询订单列表。
  @Get()
  list(@Req() req: UserRequest) {
    return this.service.list(req.userId)
  }

  // 查询订单详情。
  @Get(':orderNo')
  detail(@Req() req: UserRequest, @Param('orderNo') no: string) {
    return this.service.detail(req.userId, no)
  }

  // 取消订单并在同一事务中释放预留库存。
  @Post(':orderNo/cancel')
  @HttpCode(200)
  cancel(@Req() req: UserRequest, @Param('orderNo') no: string) {
    return this.service.cancel(req.userId, no)
  }
}
