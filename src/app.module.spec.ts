import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { BannerService } from './banner/banner.service';
import { BouquetsService } from './bouquets/bouquets.service';
import { ManageOrdersService } from './orders/manage-orders.service';
import { OrdersService } from './orders/orders.service';
import { PrismaService } from './prisma/prisma.service';
import { ShopService } from './shop/shop.service';
import { UserAuthService } from './user-auth/user-auth.service';

jest.mock('./prisma/prisma.service', () => ({ PrismaService: class {} }));
// JWT 包以 ESM 发布；这里仅验证 Nest 装配，令牌行为由鉴权测试覆盖。
jest.mock('@nestjs/jwt', () => {
  class JwtService {}
  class JwtModule {
    static register() {
      return {
        module: JwtModule,
        providers: [JwtService],
        exports: [JwtService],
      };
    }
  }
  return { JwtModule, JwtService };
});

describe('应用模块依赖装配', () => {
  it('拆分后的服务、数据访问层和跨模块依赖均可正常注入', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      for (const service of [
        BannerService,
        BouquetsService,
        ManageOrdersService,
        OrdersService,
        ShopService,
        UserAuthService,
      ]) {
        expect(module.get(service)).toBeInstanceOf(service);
      }
    } finally {
      await module.close();
    }
  });
});
