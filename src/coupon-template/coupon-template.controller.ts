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
import { CouponTemplateService } from './coupon-template.service'
import { CouponTemplateQueryDto } from './dto/coupon-template-query.dto'
import { CouponTemplateStatusDto } from './dto/coupon-template-status.dto'
import { SaveCouponTemplateDto } from './dto/save-coupon-template.dto'

// 优惠券模板接口入口。
@Controller('admin/coupon-templates')
@UseGuards(AdminAuthGuard)
export class CouponTemplateController {
  // 注入优惠券模板服务，统一处理设置业务。
  constructor(
    // 当前模块业务服务。
    private readonly service: CouponTemplateService,
  ) {}

  // 分页查询可用于商品兑换券的商品规格。
  @Get('exchange-specs')
  exchangeSpecs(
    // 列表查询条件。
    @Query() query: CouponTemplateQueryDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 分页查询可用于商品兑换券的商品规格。
    return this.service.exchangeSpecs(query, request.admin)
  }

  // 按名称、类型和状态分页查询优惠券模板。
  @Get()
  list(
    // 列表查询条件。
    @Query() query: CouponTemplateQueryDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 按名称、类型和状态分页查询优惠券模板。
    return this.service.list(query, request.admin)
  }

  // 根据模板 ID 获取优惠券规则和关联统计。
  @Get(':id')
  detail(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 根据模板 ID 获取优惠券规则和关联统计。
    return this.service.detail(id, request.admin)
  }

  // 新增现金抵扣券或指定商品规格的兑换券模板。
  @Post()
  create(
    // 接口请求参数。
    @Body() dto: SaveCouponTemplateDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.service.save(dto, request.admin)
  }

  // 完整编辑优惠券模板，不影响已发放优惠券。
  @Patch(':id')
  update(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: SaveCouponTemplateDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.service.save(dto, request.admin, id)
  }

  // 单独修改模板启停状态，启用时重新校验兑换规则。
  @Patch(':id/status')
  status(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: CouponTemplateStatusDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 单独修改模板启停状态，启用时重新校验兑换规则。
    return this.service.status(id, dto.enabled, request.admin)
  }
}
