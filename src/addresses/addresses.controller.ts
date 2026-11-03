import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import { UserAuthGuard } from '../user-auth/user-auth.guard'
import { type UserRequest } from '../user-auth/user-auth.types'
import { AddressesService } from './addresses.service'
import { AddressIdDto } from './dto/address-id.dto'
import { SaveAddressDto } from './dto/save-address.dto'
// 收货地址接口入口。
@Controller('user/addresses')
@UseGuards(UserAuthGuard)
export class AddressesController {
  // 注入收货地址业务服务，统一处理接口请求。
  constructor(
    // 当前模块业务服务。
    private readonly service: AddressesService,
  ) {}

  // 查询收货地址列表。
  @Get()
  list(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
  ) {
    // 1. 查询收货地址列表。
    return this.service.list(req.userId)
  }

  // 新增收货地址。
  @Post()
  create(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口请求参数。
    @Body() dto: SaveAddressDto,
  ) {
    // 1. 新增收货地址。
    return this.service.create(req.userId, dto)
  }

  // 更新收货地址。
  @Put(':id')
  update(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口业务参数。
    @Param() params: AddressIdDto,
    // 接口请求参数。
    @Body() dto: SaveAddressDto,
  ) {
    // 1. 更新收货地址。
    return this.service.update(req.userId, params.id, dto)
  }

  // 删除收货地址。
  @Delete(':id')
  remove(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口业务参数。
    @Param() params: AddressIdDto,
  ) {
    // 1. 删除收货地址。
    return this.service.remove(req.userId, params.id)
  }

  // 设置默认地址并保持地址簿仅有一个默认项。
  @Post(':id/default')
  @HttpCode(200)
  setDefault(
    // 当前 HTTP 请求。
    @Req() req: UserRequest,
    // 接口业务参数。
    @Param() params: AddressIdDto,
  ) {
    // 1. 设置默认地址并保持地址簿仅有一个默认项。
    return this.service.setDefault(req.userId, params.id)
  }
}
