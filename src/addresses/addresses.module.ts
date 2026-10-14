import { Module } from '@nestjs/common';
import { UserAuthModule } from '../user-auth/user-auth.module';
import { AddressesController } from './addresses.controller';
import { AddressesRepository } from './addresses.repository';
import { AddressesService } from './addresses.service';
@Module({
  imports: [UserAuthModule],
  controllers: [AddressesController],
  providers: [AddressesRepository, AddressesService],
})
export class AddressesModule {}
