import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  AdminAuthGuard,
  type AdminRequest,
} from '../common/guards/admin-auth.guard'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import { type UserRequest } from '../user-auth/user-auth.types'
import { BouquetsService } from './bouquets.service'
import { BouquetSettingsDto } from './dto/bouquet-settings.dto'
import { CreateBouquetOrderDto } from './dto/create-bouquet-order.dto'
import { CustomOrderAction } from './dto/custom-order-action.dto'
import { CustomOrderQuery } from './dto/custom-order-query.dto'
import { QuoteBouquetDto } from './dto/quote-bouquet.dto'

// 定制花束接口入口。
@Controller('shop/bouquets')
export class BouquetsController {
  // 注入定制花束业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: BouquetsService,
  ) {}

  // 查询定制花束列表。
  @Get()
  list() {
    // 1. 分页查询后台定制订单。
    return this.service.list()
  }

  // 查询定制花束详情。
  @Get(':id')
  detail(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
  ) {
    // 1. 按订单号查询定制订单详情。
    return this.service.detail(id)
  }
}
// 定制花束接口入口。
@Controller('user/custom-orders')
@UseGuards(UserAuthGuard)
export class CustomOrdersController {
  // 注入定制花束业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: BouquetsService,
  ) {}

  // 查询所选定制花束可用的本人优惠券。
  @Post('available-coupons')
  @HttpCode(200)
  availableCoupons(@Req() req: UserRequest, @Body() dto: QuoteBouquetDto) {
    return this.service.availableCoupons(req.userId, dto)
  }

  // 校验选择的商品并返回订单报价。
  @Post('quote')
  @HttpCode(200)
  quote(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: QuoteBouquetDto,
  ) {
    // 1. 校验选择的商品并返回订单报价。
    return this.service.quote(req.userId, dto)
  }

  // 提交定制订单。
  @Post()
  create(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: CreateBouquetOrderDto,
  ) {
    // 1. 提交定制订单。
    return this.service.create(req.userId, dto)
  }
}
// 定制花束接口入口。
@Controller('admin/custom-orders')
@UseGuards(AdminAuthGuard)
export class CustomOrdersAdminController {
  // 注入定制花束业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: BouquetsService,
  ) {}

  // 分页查询后台定制订单。
  @Get()
  list(
    // 列表查询条件。
    @Query() query: CustomOrderQuery,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.service.manageList(query, req.admin)
  }

  // 按订单号查询定制订单详情。
  @Get(':orderNo')
  detail(
    // 业务订单编号。
    @Param('orderNo') no: string,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.service.manageDetail(no, req.admin)
  }

  // 校验订单状态及版本，执行履约操作。
  @Post(':orderNo/actions')
  @HttpCode(200)
  action(
    // 业务订单编号。
    @Param('orderNo') no: string,
    // 接口请求参数。
    @Body() dto: CustomOrderAction,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 校验订单状态及版本，执行履约操作。
    return this.service.action(no, dto, req.admin)
  }
}
// 定制花束接口入口。
@Controller('admin/custom-settings')
@UseGuards(AdminAuthGuard)
export class CustomSettingsController {
  // 注入定制花束业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: BouquetsService,
  ) {}

  // 读取平台定制配送和联系方式设置。
  @Get()
  get(
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.service.settings(req.admin)
  }

  // 保存平台定制服务设置。
  @Put()
  save(
    // 接口请求参数。
    @Body() dto: BouquetSettingsDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.service.saveSettings(dto, req.admin)
  }
}
