import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common'
import type { AdminRequest } from '../common/guards/admin-auth.guard'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { BannerService } from './banner.service'
import { SaveBannersDto } from './dto/save-banners.dto'

// 轮播图接口入口。
@Controller('admin/banners')
@UseGuards(AdminAuthGuard)
export class BannerController {
  // 注入轮播图管理服务。
  constructor(
    // 当前模块业务服务。
    private readonly service: BannerService,
  ) {}

  // 获取全部首页轮播图及当前编辑版本。
  @Get()
  list(
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 返回首页已启用的轮播图，按排序值升序展示。
    return this.service.list(req.admin)
  }

  // 保存轮播图列表，包括新增、编辑、排序、启停和删除。
  @Put()
  save(
    // 接口请求参数。
    @Body() dto: SaveBannersDto,
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
  ) {
    // 1. 保存轮播图列表，包括新增、编辑、排序、启停和删除。
    return this.service.save(dto, req.admin)
  }
}

// 轮播图接口入口。
@Controller('home/banners')
export class HomeBannerController {
  // 注入首页轮播图读取服务。
  constructor(
    // 当前模块业务服务。
    private readonly service: BannerService,
  ) {}

  // 返回首页已启用的轮播图，按排序值升序展示。
  @Get()
  list() {
    // 1. 返回本次处理结果。
    return this.service.publicList()
  }
}
