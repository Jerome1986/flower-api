import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import { ActivityTrigger } from '@prisma/client'
import type { AdminRequest } from '../common/guards/admin-auth.guard'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { MarketingActivityStatusDto } from './dto/marketing-activity-status.dto'
import { SaveMarketingActivityDto } from './dto/save-marketing-activity.dto'
import { MarketingActivityService } from './marketing-activity.service'

// 营销活动接口入口。
@Controller('admin/marketing-activities')
@UseGuards(AdminAuthGuard)
export class MarketingActivityController {
  // 注入新人及邀请活动服务。
  constructor(
    // 当前模块业务服务。
    private readonly service: MarketingActivityService,
  ) {}

  // 查询两项活动的当前配置。
  @Get()
  list(
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 查询两项活动的当前配置。
    return this.service.list(request.admin)
  }

  // 新增或编辑指定活动的奖励及赠花配置。
  @Put(':trigger')
  save(
    // 活动触发类型。
    @Param('trigger', new ParseEnumPipe(ActivityTrigger))
    trigger: ActivityTrigger,
    // 接口请求参数。
    @Body() dto: SaveMarketingActivityDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 新增或编辑指定活动的奖励及赠花配置。
    return this.service.save(trigger, dto, request.admin)
  }

  // 启用或停用指定活动。
  @Patch(':trigger/status')
  status(
    // 活动触发类型。
    @Param('trigger', new ParseEnumPipe(ActivityTrigger))
    trigger: ActivityTrigger,
    // 接口请求参数。
    @Body() dto: MarketingActivityStatusDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 启用或停用指定活动。
    return this.service.status(trigger, dto.enabled, request.admin)
  }
}
