import {
  Body,
  Controller,
  ForbiddenException,
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
import { ProductQueryDto } from './dto/product-query.dto'
import { ProductStatusDto } from './dto/product-status.dto'
import { SaveProductCategoryDto } from './dto/save-product-category.dto'
import { SaveProductDto } from './dto/save-product.dto'
import { ProductService } from './product.service'

// 商品接口入口。
@Controller('admin/products')
@UseGuards(AdminAuthGuard)
export class ProductController {
  // 注入商品业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: ProductService,
  ) {}

  // 校验当前账号的商品访问权限。
  private authorize(
    // 订单取消申请日志。
    request: AdminRequest,
  ) {
    // 1. 不满足要求时提示：仅平台管理员可管理总商品库。
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(request.admin.role))
      throw new ForbiddenException('仅平台管理员可管理总商品库')
  }

  // 查询商品分类列表。
  @Get('categories')
  categories(
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验当前账号的商品访问权限。
    this.authorize(request)
    // 2. 查询商品分类列表。
    return this.service.categories()
  }

  // 校验平台权限并新增商品分类。
  @Post('categories')
  createCategory(
    // 接口请求参数。
    @Body() dto: SaveProductCategoryDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验当前账号的商品访问权限。
    this.authorize(request)
    // 2. 返回本次处理结果。
    return this.service.saveCategory(dto)
  }

  // 校验平台权限并更新指定商品分类。
  @Patch('categories/:id')
  updateCategory(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: SaveProductCategoryDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验当前账号的商品访问权限。
    this.authorize(request)
    // 2. 返回本次处理结果。
    return this.service.saveCategory(dto, id)
  }

  // 查询商品列表。
  @Get()
  list(
    // 列表查询条件。
    @Query() query: ProductQueryDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验当前账号的商品访问权限。
    this.authorize(request)
    // 2. 查询商品列表。
    return this.service.list(query)
  }

  // 查询商品详情。
  @Get(':id')
  detail(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验当前账号的商品访问权限。
    this.authorize(request)
    // 2. 查询商品详情。
    return this.service.detail(id)
  }

  // 新增商品。
  @Post()
  create(
    // 接口请求参数。
    @Body() dto: SaveProductDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验当前账号的商品访问权限。
    this.authorize(request)
    // 2. 返回本次处理结果。
    return this.service.save(dto)
  }

  // 更新商品。
  @Patch(':id')
  update(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: SaveProductDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验当前账号的商品访问权限。
    this.authorize(request)
    // 2. 返回本次处理结果。
    return this.service.save(dto, id)
  }

  // 设置商品启用状态。
  @Patch(':id/status')
  status(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: ProductStatusDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验当前账号的商品访问权限。
    this.authorize(request)
    // 2. 设置商品启用状态。
    return this.service.status(id, dto.enabled)
  }
}
