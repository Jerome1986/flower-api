import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { SalesController } from './sales.controller';
import { SalesRepository } from './sales.repository';
import { SalesService } from './sales.service';
@Module({
  imports: [AdminModule],
  controllers: [SalesController],
  providers: [SalesRepository, SalesService],
})
export class SalesModule {}
