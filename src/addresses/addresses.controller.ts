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
@Controller('user/addresses')
@UseGuards(UserAuthGuard)
export class AddressesController {
  // 注入收货地址业务服务，统一处理接口请求。
  constructor(private readonly service: AddressesService) {}

  // 查询收货地址列表。
  @Get()
  list(@Req() req: UserRequest) {
    return this.service.list(req.userId)
  }

  // 新增收货地址。
  @Post()
  create(@Req() req: UserRequest, @Body() dto: SaveAddressDto) {
    return this.service.create(req.userId, dto)
  }

  // 更新收货地址。
  @Put(':id')
  update(
    @Req() req: UserRequest,
    @Param() params: AddressIdDto,
    @Body() dto: SaveAddressDto,
  ) {
    return this.service.update(req.userId, params.id, dto)
  }

  // 删除收货地址。
  @Delete(':id')
  remove(@Req() req: UserRequest, @Param() params: AddressIdDto) {
    return this.service.remove(req.userId, params.id)
  }

  // 设置默认地址并保持地址簿仅有一个默认项。
  @Post(':id/default')
  @HttpCode(200)
  setDefault(@Req() req: UserRequest, @Param() params: AddressIdDto) {
    return this.service.setDefault(req.userId, params.id)
  }
}
