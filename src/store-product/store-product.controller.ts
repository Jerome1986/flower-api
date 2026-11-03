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
import { AdjustStockDto } from './dto/adjust-stock.dto'
import { CatalogQueryDto } from './dto/catalog-query.dto'
import { SelectStoreProductDto } from './dto/select-store-product.dto'
import { StoreProductQueryDto } from './dto/store-product-query.dto'
import { StoreProductSettingsDto } from './dto/store-product-settings.dto'
import { StoreProductService } from './store-product.service'

// 门店商品接口入口。
@Controller('admin/store-products')
@UseGuards(AdminAuthGuard)
export class StoreProductController {
  // 注入门店商品业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: StoreProductService,
  ) {}

  // 查询当前账号有权管理的门店选项。
  @Get('stores')
  stores(
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 查询当前账号有权管理的门店选项。
    return this.service.stores(req.admin)
  }

  // 分页查询指定门店可添加的商品，并标记本店已选商品。
  @Get('catalog')
  catalog(
    // 列表查询条件。
    @Query() query: CatalogQueryDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 分页查询指定门店可添加的商品，并标记本店已选商品。
    return this.service.catalog(query, req.admin)
  }

  // 分页查询门店已选商品、规格售价及可售和订单占用库存。
  @Get()
  list(
    // 列表查询条件。
    @Query() query: StoreProductQueryDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 分页查询门店已选商品、规格售价及可售和订单占用库存。
    return this.service.list(query, req.admin)
  }

  // 添加门店商品，并为启用规格初始化零库存。
  @Post()
  create(
    // 接口请求参数。
    @Body() dto: SelectStoreProductDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 添加门店商品，并为启用规格初始化零库存。
    return this.service.create(dto, req.admin)
  }

  // 分页查询指定门店商品各规格的库存变动记录。
  @Get(':id/logs')
  logs(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 列表查询条件。
    @Query() query: StoreProductQueryDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 分页查询指定门店商品各规格的库存变动记录。
    return this.service.logs(id, query, req.admin)
  }

  // 查询门店商品的上架状态、取货方式和各规格库存。
  @Get(':id')
  detail(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 查询门店商品的上架状态、取货方式和各规格库存。
    return this.service.detail(id, req.admin)
  }

  // 修改门店商品的上架状态及自取、配送设置。
  @Patch(':id')
  update(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: StoreProductSettingsDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 修改门店商品的上架状态及自取、配送设置。
    return this.service.update(id, dto, req.admin)
  }

  // 按版本和唯一操作标识调整规格可售库存，保留订单占用并记录流水。
  @Patch(':id/stocks/:specId')
  adjust(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 商品规格编号。
    @Param('specId', ParseIntPipe) specId: number,
    // 接口请求参数。
    @Body() dto: AdjustStockDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 按版本和唯一操作标识调整规格可售库存，保留订单占用并记录流水。
    return this.service.adjust(id, specId, dto, req.admin)
  }
}
