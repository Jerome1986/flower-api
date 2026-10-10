import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductQueryDto, SaveProductDto } from './product.dto';
import type { PrismaService } from '../prisma/prisma.service';
import type { AdminRequest } from '../common/guards/admin-auth.guard';

// 此处测试控制器的角色限制，令牌鉴权由现有 Guard 独立负责。
jest.mock('../common/guards/admin-auth.guard', () => ({
  AdminAuthGuard: class {},
}));

const input = (): SaveProductDto => ({
  name: '玫瑰',
  coverImage: '/rose.jpg',
  images: [],
  enabled: true,
  sortOrder: 0,
  specs: [
    {
      name: '8支',
      unit: '份',
      price: 1990,
      stemsPerUnit: 8,
      enabled: true,
      sortOrder: 0,
    },
  ],
});

describe('总商品库', () => {
  const tx = {
    product: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    productSpec: { create: jest.fn(), update: jest.fn() },
    productCategory: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orderItem: { count: jest.fn() },
  };
  const prisma = { ...tx, $transaction: jest.fn() };
  const service = new ProductService(prisma as unknown as PrismaService);
  it('分类名称去除首尾空格，拒绝空白分类', async () => {
    await service.saveCategory({
      name: '  玫瑰  ',
      enabled: true,
      sortOrder: 1,
    });
    expect(tx.productCategory.create).toHaveBeenCalledWith({
      data: { name: '玫瑰', enabled: true, sortOrder: 1 },
    });
    await expect(
      service.saveCategory({ name: '  ', enabled: true, sortOrder: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('重复分类名称和不存在的分类返回明确错误', async () => {
    tx.productCategory.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    await expect(
      service.saveCategory({ name: '玫瑰', enabled: true, sortOrder: 0 }),
    ).rejects.toBeInstanceOf(ConflictException);
    tx.productCategory.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: '7',
      }),
    );
    await expect(
      service.saveCategory({ name: '玫瑰', enabled: true, sortOrder: 0 }, 99),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('新商品不能选择停用分类，原商品允许保留', async () => {
    tx.productCategory.findUnique.mockResolvedValue({ id: 2, enabled: false });
    await expect(
      service.save({ ...input(), categoryId: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    tx.product.findUnique.mockResolvedValue({
      id: 1,
      categoryId: 2,
      specs: [],
      _count: { storeProducts: 0 },
    });
    tx.product.update.mockResolvedValue({ id: 1 });
    await expect(
      service.save({ ...input(), categoryId: 2 }, 1),
    ).resolves.toBeDefined();
  });
  it('非平台身份不能新增或编辑分类', () => {
    const controller = new ProductController(service);
    const request = { admin: { role: 'STORE_MANAGER' } } as AdminRequest;
    const dto = { name: '玫瑰', enabled: true, sortOrder: 0 };
    expect(() => controller.createCategory(dto, request)).toThrow(
      ForbiddenException,
    );
    expect(() => controller.updateCategory(1, dto, request)).toThrow(
      ForbiddenException,
    );
  });
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: unknown) =>
      typeof callback === 'function'
        ? callback(tx)
        : Promise.all(callback as Promise<unknown>[]),
    );
    tx.product.create.mockResolvedValue({ id: 1 });
    tx.product.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      specs: [{ price: new Prisma.Decimal('19.90') }],
    });
  });

  it('创建商品时将整数分转换为 Decimal 元，返回整数分', async () => {
    const result = await service.save(input());
    expect(tx.product.create.mock.calls[0][0].data.code).toEqual(
      expect.any(String),
    );
    expect(result).not.toHaveProperty('code');
    expect(tx.productSpec.create.mock.calls[0][0].data.price.toString()).toBe(
      '19.9',
    );
    expect(result.specs[0].price).toBe(1990);
    expect(tx.productSpec.create.mock.calls[0][0].data.productId).toBe(1);
  });

  it('拒绝重复规格与非本商品规格', async () => {
    const dto = input();
    dto.specs.push({ ...dto.specs[0] });
    await expect(service.save(dto)).rejects.toBeInstanceOf(BadRequestException);
    dto.specs = [{ ...dto.specs[0], id: 99 }];
    tx.product.findUnique.mockResolvedValue({
      id: 1,
      specs: [],
      _count: { storeProducts: 0 },
    });
    await expect(service.save(dto, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('已有门店选品的商品仍可正常编辑分类和内容', async () => {
    tx.product.findUnique.mockResolvedValue({
      id: 1,
      specs: [],
      _count: { storeProducts: 1 },
    });
    tx.product.update.mockResolvedValue({ id: 1 });
    await expect(service.save(input(), 1)).resolves.toBeDefined();
    expect(tx.product.update).toHaveBeenCalled();
    expect(tx.product.update.mock.calls[0][0].data).not.toHaveProperty('type');
  });

  it('遗漏的历史规格保留并停用', async () => {
    tx.product.findUnique.mockResolvedValue({
      id: 1,
      specs: [{ id: 5, name: '历史规格' }],
      _count: { storeProducts: 0 },
    });
    tx.product.update.mockResolvedValue({ id: 1 });
    await service.save(input(), 1);
    expect(tx.productSpec.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: expect.objectContaining({ enabled: false }),
      }),
    );
    expect(tx.productSpec.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { name: '历史规格' },
    });
  });

  it('唯一约束冲突转换为业务冲突错误', async () => {
    tx.product.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    await expect(service.save(input())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('不存在商品不能变更状态', async () => {
    tx.product.findUnique.mockResolvedValue(null);
    await expect(service.status(1, false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('店长和普通后台角色不能访问总商品库', () => {
    const controller = new ProductController(service);
    for (const role of [
      'STORE_MANAGER',
      'STORE_ADMIN',
      'CONTENT_ADMIN',
      'CUSTOMER_SERVICE',
    ]) {
      expect(() =>
        controller.list(new ProductQueryDto(), {
          admin: { role },
        } as AdminRequest),
      ).toThrow(ForbiddenException);
    }
  });

  it('筛选 false 正确转换，非法布尔值和非整数金额被拒绝', async () => {
    const query = plainToInstance(ProductQueryDto, {
      enabled: 'false',
      page: '2',
    });
    expect(query.enabled).toBe(false);
    expect(await validate(query)).toHaveLength(0);
    expect(
      (await validate(plainToInstance(ProductQueryDto, { enabled: 'invalid' })))
        .length,
    ).toBeGreaterThan(0);
    const dto = input();
    dto.specs[0].price = 19.9;
    expect(
      (await validate(plainToInstance(SaveProductDto, dto))).length,
    ).toBeGreaterThan(0);
  });
});
