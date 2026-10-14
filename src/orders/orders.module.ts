import { Module } from '@nestjs/common';
import { UserAuthModule } from '../user-auth/user-auth.module';
import { ManageOrdersController } from './manage-orders.controller';
import { ManageOrdersRepository } from './manage-orders.repository';
import { ManageOrdersService } from './manage-orders.service';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [UserAuthModule],
  controllers: [OrdersController, ManageOrdersController],
  providers: [
    OrdersRepository,
    ManageOrdersRepository,
    OrdersService,
    ManageOrdersService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}

// 兼容原模块文件中导出的用户订单控制器。
export { OrdersController } from './orders.controller';
