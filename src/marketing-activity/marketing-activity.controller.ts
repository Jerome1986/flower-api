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

@Controller('admin/marketing-activities')
@UseGuards(AdminAuthGuard)
export class MarketingActivityController {
  // 注入新人及邀请活动服务。
  constructor(private readonly service: MarketingActivityService) {}

  // 查询两项活动的当前配置。
  @Get()
  list(@Req() request: AdminRequest) {
    return this.service.list(request.admin)
  }

  // 新增或编辑指定活动的奖励及赠花配置。
  @Put(':trigger')
  save(
    @Param('trigger', new ParseEnumPipe(ActivityTrigger))
    trigger: ActivityTrigger,
    @Body() dto: SaveMarketingActivityDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.save(trigger, dto, request.admin)
  }

  // 启用或停用指定活动。
  @Patch(':trigger/status')
  status(
    @Param('trigger', new ParseEnumPipe(ActivityTrigger))
    trigger: ActivityTrigger,
    @Body() dto: MarketingActivityStatusDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.status(trigger, dto.enabled, request.admin)
  }
}
