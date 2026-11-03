import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import {
  AdminAuthGuard,
  type AdminRequest,
} from '../common/guards/admin-auth.guard'
import { SalesQueryDto } from './dto/sales-query.dto'
import { SalesService } from './sales.service'
// 销售统计接口入口。
@Controller('admin/sales')
@UseGuards(AdminAuthGuard)
export class SalesController {
  // 注入销售统计业务服务，统一处理接口请求。
  constructor(
    // 销售统计服务。
    private readonly sales: SalesService,
  ) {}

  // 按北京时间统计门店收入、订单状态和赠花数据。
  @Get()
  summary(
    // 当前 HTTP 请求。
    @Req() req: AdminRequest,
    // 列表查询条件。
    @Query() query: SalesQueryDto,
  ) {
    // 1. 返回本次处理结果。
    return this.sales.summary(req.admin, query)
  }
}
