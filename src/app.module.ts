import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { PrismaModule } from './prisma/prisma.modules';
import { ScheduleModule } from '@nestjs/schedule'
import { ConfigModule } from '@nestjs/config'
import { StoreModule } from './store/store.module';
import { ProductModule } from './product/product.module';
import { StoreProductModule } from './store-product/store-product.module';
import { CouponTemplateModule } from './coupon-template/coupon-template.module';
import { MarketingActivityModule } from './marketing-activity/marketing-activity.module';
import { AdminAccountModule } from './admin-account/admin-account.module';

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
    AdminAccountModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
