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

@Controller('store')
@UseGuards(AdminAuthGuard)
export class StoreController {
  // 注入门店业务服务，统一处理接口请求。
  constructor(private readonly storeService: StoreService) {}

  // 新增门店。
  @Post()
  create(@Body() createStoreDto: CreateStoreDto, @Req() request: AdminRequest) {
    return this.storeService.create(createStoreDto, request.admin)
  }

  // 按账号可见范围分页查询门店。
  @Get()
  findAll(@Query() query: QueryStoreDto, @Req() request: AdminRequest) {
    return this.storeService.findAll(query, request.admin)
  }

  // 校验门店 ID 和访问范围，读取门店详情。
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() request: AdminRequest) {
    this.checkId(id)
    return this.storeService.findOne(id, request.admin)
  }

  // 设置门店启用状态。
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StoreStatusDto,
    @Req() request: AdminRequest,
  ) {
    this.checkId(id)
    return this.storeService.updateStatus(id, dto, request.admin)
  }

  // 更新门店。
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStoreDto: UpdateStoreDto,
    @Req() request: AdminRequest,
  ) {
    this.checkId(id)
    return this.storeService.update(id, updateStoreDto, request.admin)
  }

  // 删除门店。
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: AdminRequest) {
    this.checkId(id)
    return this.storeService.remove(id, request.admin)
  }

  // 校验资源 ID 的取值范围。
  private checkId(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new BadRequestException('门店 ID 必须为正整数')
  }
}
