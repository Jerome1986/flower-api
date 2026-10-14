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
} from '@nestjs/common';
import {
  AdminAuthGuard,
  type AdminRequest,
} from '../common/guards/admin-auth.guard';
import { UserAuthGuard } from '../user-auth/user-auth.guard';
import { type UserRequest } from '../user-auth/user-auth.types';
import { BouquetsService } from './bouquets.service';
import { BouquetSettingsDto } from './dto/bouquet-settings.dto';
import { CreateBouquetOrderDto } from './dto/create-bouquet-order.dto';
import { CustomOrderAction } from './dto/custom-order-action.dto';
import { CustomOrderQuery } from './dto/custom-order-query.dto';
import { QuoteBouquetDto } from './dto/quote-bouquet.dto';

@Controller('shop/bouquets')
export class BouquetsController {
  // 注入定制花束业务服务，统一处理接口请求。
  constructor(private readonly service: BouquetsService) {}

  // 查询定制花束列表。
  @Get()
  list() {
    return this.service.list();
  }

  // 查询定制花束详情。
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }
}
@Controller('user/custom-orders')
@UseGuards(UserAuthGuard)
export class CustomOrdersController {
  // 注入定制花束业务服务，统一处理接口请求。
  constructor(private readonly service: BouquetsService) {}

  // 校验选择的商品并返回订单报价。
  @Post('quote')
  @HttpCode(200)
  quote(@Req() req: UserRequest, @Body() dto: QuoteBouquetDto) {
    return this.service.quote(req.userId, dto);
  }

  // 提交定制订单。
  @Post()
  create(@Req() req: UserRequest, @Body() dto: CreateBouquetOrderDto) {
    return this.service.create(req.userId, dto);
  }
}
@Controller('admin/custom-orders')
@UseGuards(AdminAuthGuard)
export class CustomOrdersAdminController {
  // 注入定制花束业务服务，统一处理接口请求。
  constructor(private readonly service: BouquetsService) {}

  // 分页查询后台定制订单。
  @Get()
  list(@Query() query: CustomOrderQuery, @Req() req: AdminRequest) {
    return this.service.manageList(query, req.admin);
  }

  // 按订单号查询定制订单详情。
  @Get(':orderNo')
  detail(@Param('orderNo') no: string, @Req() req: AdminRequest) {
    return this.service.manageDetail(no, req.admin);
  }

  // 校验订单状态及版本，执行履约操作。
  @Post(':orderNo/actions')
  @HttpCode(200)
  action(
    @Param('orderNo') no: string,
    @Body() dto: CustomOrderAction,
    @Req() req: AdminRequest,
  ) {
    return this.service.action(no, dto, req.admin);
  }
}
@Controller('admin/custom-settings')
@UseGuards(AdminAuthGuard)
export class CustomSettingsController {
  // 注入定制花束业务服务，统一处理接口请求。
  constructor(private readonly service: BouquetsService) {}

  // 读取平台定制配送和联系方式设置。
  @Get()
  get(@Req() req: AdminRequest) {
    return this.service.settings(req.admin);
  }

  // 保存平台定制服务设置。
  @Put()
  save(@Body() dto: BouquetSettingsDto, @Req() req: AdminRequest) {
    return this.service.saveSettings(dto, req.admin);
  }
}
