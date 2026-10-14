import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  AdminAuthGuard,
  type AdminRequest,
} from '../common/guards/admin-auth.guard';
import { SalesQueryDto } from './dto/sales-query.dto';
import { SalesService } from './sales.service';
@Controller('admin/sales')
@UseGuards(AdminAuthGuard)
export class SalesController {
  // 注入销售统计业务服务，统一处理接口请求。
  constructor(private readonly sales: SalesService) {}

  // 按北京时间统计门店收入、订单状态和赠花数据。
  @Get()
  summary(@Req() req: AdminRequest, @Query() query: SalesQueryDto) {
    return this.sales.summary(req.admin, query);
  }
}
