import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common'
import type { AdminRequest } from '../common/guards/admin-auth.guard'
import { AdminAuthGuard } from '../common/guards/admin-auth.guard'
import { BannerService } from './banner.service'
import { SaveBannersDto } from './dto/save-banners.dto'

@Controller('admin/banners')
@UseGuards(AdminAuthGuard)
export class BannerController {
  // 注入轮播图管理服务。
  constructor(private readonly service: BannerService) {}

  // 获取全部首页轮播图及当前编辑版本。
  @Get()
  list(@Req() req: AdminRequest) {
    return this.service.list(req.admin)
  }

  // 保存轮播图列表，包括新增、编辑、排序、启停和删除。
  @Put()
  save(@Body() dto: SaveBannersDto, @Req() req: AdminRequest) {
    return this.service.save(dto, req.admin)
  }
}

@Controller('home/banners')
export class HomeBannerController {
  // 注入首页轮播图读取服务。
  constructor(private readonly service: BannerService) {}

  // 返回首页已启用的轮播图，按排序值升序展示。
  @Get()
  list() {
    return this.service.publicList()
  }
}
