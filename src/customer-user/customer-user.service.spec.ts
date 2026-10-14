import { ForbiddenException } from '@nestjs/common';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import type { PrismaService } from '../prisma/prisma.service';
import { CustomerUserRepository } from './customer-user.repository';
import { CustomerUserService } from './customer-user.service';

describe('CustomerUserService', () => {
  const admin: CurrentAdmin = {
    id: 1,
    username: 'owner',
    role: 'SUPER_ADMIN',
    storeId: null,
  };
  const record = {
    id: 2,
    openId: 'openid-2',
    phone: '15527650094',
    role: 'CUSTOMER',
    nickname: '花友',
    avatar: null,
    inviteCode: 'INVITE2',
    enabled: true,
    registeredAt: new Date('2026-01-01T00:00:00.000Z'),
    lastLoginAt: null,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    managedStores: [],
  };
  let db: any;
  let service: CustomerUserService;

  beforeEach(() => {
    db = {
      user: {
        findUnique: jest.fn(async () => record),
        findMany: jest.fn(async () => [record]),
        count: jest.fn(async () => 1),
        update: jest.fn(async ({ data }) => ({ ...record, ...data })),
      },
      $transaction: jest.fn(async (items) => Promise.all(items)),
    };
    service = new CustomerUserService(
      new CustomerUserRepository(db as PrismaService),
    );
  });

  it('仅平台管理员可查询用户', async () => {
    await expect(
      service.list(
        { page: 1, pageSize: 10 },
        { ...admin, role: 'STORE_MANAGER' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('按关键词和状态分页查询，并映射为后台接口字段', async () => {
    const result = await service.list(
      { page: 2, pageSize: 10, keyword: ' 花友 ', status: 'ACTIVE' },
      admin,
    );
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          enabled: true,
          OR: expect.arrayContaining([{ nickname: { contains: '花友' } }]),
        }),
      }),
    );
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      list: [{ id: 2, mobile: '15527650094', status: 'ACTIVE' }],
    });
  });

  it('停用用户仅更新 enabled 字段并返回 INACTIVE 状态', async () => {
    const result = await service.status(2, 'INACTIVE', admin);
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: { enabled: false } }),
    );
    expect(result.status).toBe('INACTIVE');
  });
});
