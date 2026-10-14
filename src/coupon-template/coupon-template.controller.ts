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
} from '@nestjs/common';
import type { AdminRequest } from '../common/guards/admin-auth.guard';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { CouponTemplateService } from './coupon-template.service';
import { CouponTemplateQueryDto } from './dto/coupon-template-query.dto';
import { CouponTemplateStatusDto } from './dto/coupon-template-status.dto';
import { SaveCouponTemplateDto } from './dto/save-coupon-template.dto';

@Controller('admin/coupon-templates')
@UseGuards(AdminAuthGuard)
export class CouponTemplateController {
  // 注入优惠券模板服务，统一处理设置业务。
  constructor(private readonly service: CouponTemplateService) {}

  // 分页查询可用于商品兑换券的商品规格。
  @Get('exchange-specs')
  exchangeSpecs(
    @Query() query: CouponTemplateQueryDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.exchangeSpecs(query, request.admin);
  }

  // 按名称、类型和状态分页查询优惠券模板。
  @Get()
  list(@Query() query: CouponTemplateQueryDto, @Req() request: AdminRequest) {
    return this.service.list(query, request.admin);
  }

  // 根据模板 ID 获取优惠券规则和关联统计。
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @Req() request: AdminRequest) {
    return this.service.detail(id, request.admin);
  }

  // 新增现金抵扣券或指定商品规格的兑换券模板。
  @Post()
  create(@Body() dto: SaveCouponTemplateDto, @Req() request: AdminRequest) {
    return this.service.save(dto, request.admin);
  }

  // 完整编辑优惠券模板，不影响已发放优惠券。
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveCouponTemplateDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.save(dto, request.admin, id);
  }

  // 单独修改模板启停状态，启用时重新校验兑换规则。
  @Patch(':id/status')
  status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CouponTemplateStatusDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.status(id, dto.enabled, request.admin);
  }
}
