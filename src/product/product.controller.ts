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

@Controller('admin/products')
@UseGuards(AdminAuthGuard)
export class ProductController {
  // 注入商品业务服务，统一处理接口请求。
  constructor(private readonly service: ProductService) {}

  // 校验当前账号的商品访问权限。
  private authorize(request: AdminRequest) {
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(request.admin.role))
      throw new ForbiddenException('仅平台管理员可管理总商品库')
  }

  // 查询商品分类列表。
  @Get('categories')
  categories(@Req() request: AdminRequest) {
    this.authorize(request)
    return this.service.categories()
  }

  // 校验平台权限并新增商品分类。
  @Post('categories')
  createCategory(
    @Body() dto: SaveProductCategoryDto,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request)
    return this.service.saveCategory(dto)
  }

  // 校验平台权限并更新指定商品分类。
  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveProductCategoryDto,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request)
    return this.service.saveCategory(dto, id)
  }

  // 查询商品列表。
  @Get()
  list(@Query() query: ProductQueryDto, @Req() request: AdminRequest) {
    this.authorize(request)
    return this.service.list(query)
  }

  // 查询商品详情。
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @Req() request: AdminRequest) {
    this.authorize(request)
    return this.service.detail(id)
  }

  // 新增商品。
  @Post()
  create(@Body() dto: SaveProductDto, @Req() request: AdminRequest) {
    this.authorize(request)
    return this.service.save(dto)
  }

  // 更新商品。
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveProductDto,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request)
    return this.service.save(dto, id)
  }

  // 设置商品启用状态。
  @Patch(':id/status')
  status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProductStatusDto,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request)
    return this.service.status(id, dto.enabled)
  }
}
