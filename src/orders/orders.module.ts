import { Module } from '@nestjs/common'
import { UserAuthModule } from '../user-auth/user-auth.module'
import { ManageOrdersController } from './manage-orders.controller'
import { ManageOrdersRepository } from './manage-orders.repository'
import { ManageOrdersService } from './manage-orders.service'
import { OrdersController } from './orders.controller'
import { OrdersRepository } from './orders.repository'
import { OrdersService } from './orders.service'
import {
  PaymentController,
  PaymentNotifyController,
} from '../payment/payment.controller'
import { PaymentService } from '../payment/payment.service'
import { WechatPayClient } from '../payment/wechat-pay.client'
import { PaymentRepository } from '../payment/payment.repository'
import { NotifyService } from '../notify/notify.service'

// 订单模块依赖注册。
@Module({
  imports: [UserAuthModule],
  controllers: [
    OrdersController,
    ManageOrdersController,
    PaymentController,
    PaymentNotifyController,
  ],
  providers: [
    PaymentService,
    PaymentRepository,
    NotifyService,
    WechatPayClient,
    OrdersRepository,
    ManageOrdersRepository,
    OrdersService,
    ManageOrdersService,
  ],
  exports: [OrdersService, PaymentService],
})
export class OrdersModule {}

// 兼容原模块文件中导出的用户订单控制器。
export { OrdersController } from './orders.controller'
