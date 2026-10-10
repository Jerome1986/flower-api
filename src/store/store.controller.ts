import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import type { AdminRequest } from '../common/guards/admin-auth.guard';
import { QueryStoreDto } from './dto/query-store.dto';
import { StoreStatusDto } from './dto/store-status.dto';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Controller('store')
@UseGuards(AdminAuthGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  create(@Body() createStoreDto: CreateStoreDto, @Req() request: AdminRequest) {
    return this.storeService.create(createStoreDto, request.admin);
  }

  @Get()
  findAll(@Query() query: QueryStoreDto, @Req() request: AdminRequest) {
    return this.storeService.findAll(query, request.admin);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() request: AdminRequest) {
    this.checkId(id);
    return this.storeService.findOne(id, request.admin);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StoreStatusDto,
    @Req() request: AdminRequest,
  ) {
    this.checkId(id);
    return this.storeService.updateStatus(id, dto, request.admin);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStoreDto: UpdateStoreDto,
    @Req() request: AdminRequest,
  ) {
    this.checkId(id);
    return this.storeService.update(id, updateStoreDto, request.admin);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() request: AdminRequest) {
    this.checkId(id);
    return this.storeService.remove(id, request.admin);
  }

  private checkId(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new BadRequestException('门店 ID 必须为正整数');
  }
}
