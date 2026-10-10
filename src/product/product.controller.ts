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
} from '@nestjs/common';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import type { AdminRequest } from '../common/guards/admin-auth.guard';
import { ProductService } from './product.service';
import {
  ProductQueryDto,
  ProductStatusDto,
  SaveProductDto,
  SaveProductCategoryDto,
} from './product.dto';

@Controller('admin/products')
@UseGuards(AdminAuthGuard)
export class ProductController {
  constructor(private readonly service: ProductService) {}
  private authorize(request: AdminRequest) {
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(request.admin.role))
      throw new ForbiddenException('仅平台管理员可管理总商品库');
  }
  @Get('categories') categories(@Req() request: AdminRequest) {
    this.authorize(request);
    return this.service.categories();
  }
  @Post('categories') createCategory(
    @Body() dto: SaveProductCategoryDto,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request);
    return this.service.saveCategory(dto);
  }
  @Patch('categories/:id') updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveProductCategoryDto,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request);
    return this.service.saveCategory(dto, id);
  }
  @Get() list(@Query() query: ProductQueryDto, @Req() request: AdminRequest) {
    this.authorize(request);
    return this.service.list(query);
  }
  @Get(':id') detail(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request);
    return this.service.detail(id);
  }
  @Post() create(@Body() dto: SaveProductDto, @Req() request: AdminRequest) {
    this.authorize(request);
    return this.service.save(dto);
  }
  @Patch(':id') update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveProductDto,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request);
    return this.service.save(dto, id);
  }
  @Patch(':id/status') status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProductStatusDto,
    @Req() request: AdminRequest,
  ) {
    this.authorize(request);
    return this.service.status(id, dto.enabled);
  }
}
