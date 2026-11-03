import { Module } from '@nestjs/common'
import { UserAuthModule } from '../user-auth/user-auth.module'
import { AddressesController } from './addresses.controller'
import { AddressesRepository } from './addresses.repository'
import { AddressesService } from './addresses.service'
// 收货地址模块依赖注册。
@Module({
  imports: [UserAuthModule],
  controllers: [AddressesController],
  providers: [AddressesRepository, AddressesService],
})
export class AddressesModule {}
