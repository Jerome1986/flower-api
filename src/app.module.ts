import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { AddressesModule } from './addresses/addresses.module'
import { AdminAccountModule } from './admin-account/admin-account.module'
import { AdminModule } from './admin/admin.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { BannerModule } from './banner/banner.module'
import { BouquetsModule } from './bouquets/bouquets.module'
import { CouponTemplateModule } from './coupon-template/coupon-template.module'
import { CustomerUserModule } from './customer-user/customer-user.module'
import { MarketingActivityModule } from './marketing-activity/marketing-activity.module'
import { OrdersModule } from './orders/orders.module'
import { PrismaModule } from './prisma/prisma.modules'
import { ProductModule } from './product/product.module'
import { SalesModule } from './sales/sales.module'
import { ShopModule } from './shop/shop.module'
import { StoreProductModule } from './store-product/store-product.module'
import { StoreModule } from './store/store.module'
import { UserAuthModule } from './user-auth/user-auth.module'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AdminModule,
    StoreModule,
    ProductModule,
    StoreProductModule,
    CouponTemplateModule,
    MarketingActivityModule,
    AdminAccountModule,
    BannerModule,
    UserAuthModule,
    ShopModule,
    SalesModule,
    AddressesModule,
    OrdersModule,
    BouquetsModule,
    CustomerUserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
