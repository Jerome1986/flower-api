import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { CreateStoreDto } from './dto/create-store.dto'
import { QueryStoreDto } from './dto/query-store.dto'
import { StoreStatusDto } from './dto/store-status.dto'
import { UpdateStoreDto } from './dto/update-store.dto'
import { StoreService } from './store.service'

// 门店接口入口。
@Controller('store')
@UseGuards(AdminAuthGuard)
export class StoreController {
  // 注入门店业务服务，统一处理接口请求。
  constructor(
    // 门店业务服务。
    private readonly storeService: StoreService,
  ) {}

  // 新增门店。
  @Post()
  create(
    // 新建门店请求参数。
    @Body() createStoreDto: CreateStoreDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.storeService.create(createStoreDto, request.admin)
  }

  // 按账号可见范围分页查询门店。
  @Get()
  findAll(
    // 列表查询条件。
    @Query() query: QueryStoreDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 返回本次处理结果。
    return this.storeService.findAll(query, request.admin)
  }

  // 校验门店 ID 和访问范围，读取门店详情。
  @Get(':id')
  findOne(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验资源 ID 的取值范围。
    this.checkId(id)
    // 2. 返回本次处理结果。
    return this.storeService.findOne(id, request.admin)
  }

  // 设置门店启用状态。
  @Patch(':id/status')
  updateStatus(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 接口请求参数。
    @Body() dto: StoreStatusDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验资源 ID 的取值范围。
    this.checkId(id)
    // 2. 返回本次处理结果。
    return this.storeService.updateStatus(id, dto, request.admin)
  }

  // 更新门店。
  @Patch(':id')
  update(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 修改门店请求参数。
    @Body() updateStoreDto: UpdateStoreDto,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验资源 ID 的取值范围。
    this.checkId(id)
    // 2. 返回本次处理结果。
    return this.storeService.update(id, updateStoreDto, request.admin)
  }

  // 删除门店。
  @Delete(':id')
  remove(
    // 记录编号。
    @Param('id', ParseIntPipe) id: number,
    // 订单取消申请日志。
    @Req() request: AdminRequest,
  ) {
    // 1. 校验资源 ID 的取值范围。
    this.checkId(id)
    // 2. 返回本次处理结果。
    return this.storeService.remove(id, request.admin)
  }

  // 校验资源 ID 的取值范围。
  private checkId(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 不满足要求时提示：门店 ID 必须为正整数。
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new BadRequestException('门店 ID 必须为正整数')
  }
}
