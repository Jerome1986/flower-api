import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import type { PrismaService } from '../prisma/prisma.service';
import { CouponTemplateService } from './coupon-template.service';
import {
  CouponTemplateQueryDto,
  SaveCouponTemplateDto,
} from './coupon-template.dto';

const admin: CurrentAdmin = {
  id: 1,
  username: 'admin',
  role: 'PLATFORM_ADMIN',
  storeId: null,
};
const cash = (): SaveCouponTemplateDto => ({
  name: '新人优惠券',
  type: 'CASH',
  cashAmount: 1000,
  exchangeSpecId: null,
  exchangeQuantity: null,
  validityHours: 120,
  enabled: true,
});
const exchange = (): SaveCouponTemplateDto => ({
  ...cash(),
  type: 'EXCHANGE',
  cashAmount: null,
  exchangeSpecId: 6,
  exchangeQuantity: 1,
});
const spec = () => ({
  id: 6,
  name: '8支',
  unit: '份',
  price: new Prisma.Decimal('39.90'),
  enabled: true,
  product: { id: 5, name: '玫瑰', coverImage: '/rose.jpg', enabled: true },
});
const template = () => ({
  id: 1,
  ...cash(),
  cashAmount: new Prisma.Decimal('10.00'),
  exchangeSpec: null,
  _count: { coupons: 3, activities: 1 },
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('优惠券模板设置', () => {
  const db = {
    couponTemplate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    productSpec: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    marketingActivity: { count: jest.fn() },
    userCoupon: { update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new CouponTemplateService(db as unknown as PrismaService);
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function'
        ? arg(db)
        : Promise.all(arg as Promise<unknown>[]),
    );
    db.couponTemplate.findUnique.mockResolvedValue(template());
    db.couponTemplate.create.mockResolvedValue(template());
    db.couponTemplate.update.mockResolvedValue(template());
    db.productSpec.findUnique.mockResolvedValue(spec());
    db.marketingActivity.count.mockResolvedValue(0);
  });

  it('所有设置接口均拒绝非平台身份', async () => {
    for (const role of [
      'STORE_ADMIN',
      'STORE_MANAGER',
      'CONTENT_ADMIN',
      'CUSTOMER_SERVICE',
    ] as const) {
      const actor = { ...admin, role };
      await expect(
        service.list(new CouponTemplateQueryDto(), actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.exchangeSpecs(new CouponTemplateQueryDto(), actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.detail(1, actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.save(cash(), actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(service.status(1, true, actor)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
    expect(db.couponTemplate.create).not.toHaveBeenCalled();
  });

  it('现金面额以整数分输入输出，数据库保存精确元金额', async () => {
    const result = await service.save(
      { ...cash(), name: '  新人优惠券  ', cashAmount: 1990 },
      admin,
    );
    const data = db.couponTemplate.create.mock.calls[0][0].data;
    expect(data.cashAmount.toString()).toBe('19.9');
    expect(data.name).toBe('新人优惠券');
    expect(data.scope).toBe('ALL');
    expect(result.cashAmount).toBe(1000);
    expect(result.issuedCount).toBe(3);
  });

  it('拒绝零面额、非整数分和错误混合的现金券规则', async () => {
    for (const cashAmount of [0, -1, 10.5, null]) {
      await expect(
        service.save({ ...cash(), cashAmount }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.save({ ...cash(), exchangeSpecId: 6 }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('兑换券须指定有效商品规格和正整数数量', async () => {
    await service.save(exchange(), admin);
    expect(db.couponTemplate.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        cashAmount: null,
        exchangeSpecId: 6,
        exchangeQuantity: 1,
      }),
    );
    await expect(
      service.save({ ...exchange(), exchangeQuantity: 0 }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.save({ ...exchange(), cashAmount: 100 }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    db.productSpec.findUnique.mockResolvedValue(null);
    await expect(service.save(exchange(), admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('禁止新选或启用停售的兑换商品', async () => {
    db.productSpec.findUnique.mockResolvedValue({
      ...spec(),
      product: { ...spec().product, enabled: false },
    });
    await expect(service.save(exchange(), admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    db.couponTemplate.findUnique.mockResolvedValue({
      ...template(),
      ...exchange(),
      exchangeSpec: spec(),
    });
    await expect(service.status(1, true, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('停用模板允许保留原先的停售规格以便维护历史配置', async () => {
    db.productSpec.findUnique.mockResolvedValue({ ...spec(), enabled: false });
    db.couponTemplate.findUnique.mockResolvedValue({
      ...template(),
      ...exchange(),
      exchangeSpec: spec(),
    });
    await expect(
      service.save({ ...exchange(), enabled: false }, admin, 1),
    ).resolves.toBeDefined();
    await expect(
      service.save({ ...exchange(), enabled: false }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('关联赠花活动的兑换券不能切换为现金券', async () => {
    db.couponTemplate.findUnique.mockResolvedValue({
      ...template(),
      ...exchange(),
      exchangeSpec: spec(),
    });
    db.marketingActivity.count.mockResolvedValue(1);
    await expect(service.save(cash(), admin, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.couponTemplate.update).not.toHaveBeenCalled();
  });

  it('编辑和停用模板不会回写已发放的用户优惠券', async () => {
    await service.save(
      { ...cash(), cashAmount: 2000, validityHours: 48 },
      admin,
      1,
    );
    await service.status(1, false, admin);
    expect(db.couponTemplate.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { enabled: false } }),
    );
    expect(db.userCoupon.update).not.toHaveBeenCalled();
    expect(db.userCoupon.updateMany).not.toHaveBeenCalled();
  });

  it('按名称、类型和停用状态分页筛选', async () => {
    db.couponTemplate.findMany.mockResolvedValue([template()]);
    db.couponTemplate.count.mockResolvedValue(1);
    const result = await service.list(
      {
        page: 2,
        pageSize: 10,
        keyword: ' 新人 ',
        type: 'CASH',
        enabled: false,
      },
      admin,
    );
    expect(db.couponTemplate.findMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        where: { name: { contains: '新人' }, type: 'CASH', enabled: false },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.total).toBe(1);
  });

  it('规格搜索只返回可售商品的启用规格', async () => {
    db.productSpec.findMany.mockResolvedValue([spec()]);
    db.productSpec.count.mockResolvedValue(1);
    const result = await service.exchangeSpecs(
      { page: 1, pageSize: 20, keyword: '玫瑰' },
      admin,
    );
    expect(db.productSpec.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ enabled: true, product: { enabled: true } }),
    );
    expect(result.list[0].price).toBe(3990);
  });

  it('空名称、无效有效期和不存在的模板返回明确错误', async () => {
    await expect(
      service.save({ ...cash(), name: '  ' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    for (const validityHours of [0, 1.5, 87601])
      await expect(
        service.save({ ...cash(), validityHours }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.detail(-1, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    db.couponTemplate.findUnique.mockResolvedValue(null);
    await expect(service.detail(999, admin)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('请求校验拒绝未知字段，布尔筛选 false 正确转换', async () => {
    const query = plainToInstance(CouponTemplateQueryDto, {
      enabled: 'false',
      page: '2',
    });
    expect(query.enabled).toBe(false);
    expect(await validate(query)).toHaveLength(0);
    expect(
      await validate(plainToInstance(SaveCouponTemplateDto, cash())),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(SaveCouponTemplateDto, { ...cash(), scope: 'A' }),
          { whitelist: true, forbidNonWhitelisted: true },
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
