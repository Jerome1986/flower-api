import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import * as storeCode from '../utils/generate-store-code';
import { StoreController } from './store.controller';
import { StoreRepository } from './store.repository';
import { StoreService } from './store.service';

jest.mock('@nestjs/jwt', () => ({ JwtService: jest.fn() }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: jest.fn() }));

describe('门店接口（隔离数据库 HTTP 验证）', () => {
  let app: INestApplication;
  const prisma = {
    admin: { findUnique: jest.fn() },
    user: { upsert: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    store: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(
      (operations: Promise<unknown>[] | ((tx: object) => Promise<unknown>)) =>
        typeof operations === 'function'
          ? operations(prisma)
          : Promise.all(operations),
    ),
  };
  const jwt = { verifyAsync: jest.fn() };
  const input = {
    managerPhone: '13900000000',
    name: '中心店',
    address: '中心街18号',
    phone: '13800000000',
    businessHours: '09:00–21:00',
    deliveryFee: 550,
  };
  const record = () => ({
    ...input,
    code: 'A1B2C3',
    id: 2,
    managerId: 100,
    manager: { id: 100, phone: '13900000000', nickname: '店长' },
    enabled: true,
    isOpen: true,
    deliveryFee: new Prisma.Decimal('5.50'),
    servicePhone: null,
    deliveryArea: null,
    deliveryStaff: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const platform = 'Bearer platform';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StoreController],
      providers: [
        StoreService,
        StoreRepository,
        AdminAuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jwt.verifyAsync.mockImplementation(async (token: string) => {
      if (token === 'expired') throw new Error('expired');
      return {
        passwordVersion: createHash('sha256')
          .update('test-password-hash')
          .digest('hex'),
        type: ['customer', 'manager'].includes(token) ? 'user' : 'admin',
        userId:
          token === 'manager'
            ? 100
            : token === 'store'
              ? 2
              : token === 'disabled'
                ? 3
                : token === 'legacy'
                  ? 4
                  : 1,
      };
    });
    prisma.admin.findUnique.mockImplementation(
      async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        username: 'test',
        password: 'test-password-hash',
        role:
          where.id === 2
            ? 'STORE_ADMIN'
            : where.id === 4
              ? 'CUSTOMER_SERVICE'
              : 'PLATFORM_ADMIN',
        storeId: where.id === 2 ? 2 : null,
        status: where.id !== 3,
      }),
    );
    prisma.store.findMany.mockResolvedValue([record()]);
    prisma.user.upsert.mockResolvedValue({ id: 100, enabled: true });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockImplementation(
      async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        phone: '13900000000',
        enabled: true,
        role: where.id === 100 ? 'STORE_MANAGER' : 'CUSTOMER',
        managedStores: where.id === 100 ? [{ id: 2 }, { id: 7 }] : [],
      }),
    );
    prisma.store.count.mockResolvedValue(1);
    prisma.store.findUnique.mockResolvedValue(record());
    prisma.store.create.mockImplementation(
      async ({ data }: { data: object }) => ({
        ...record(),
        ...data,
        manager: record().manager,
      }),
    );
    prisma.store.update.mockImplementation(
      async ({ data }: { data: object }) => ({
        ...record(),
        ...data,
        manager: record().manager,
      }),
    );
  });

  it.each([
    undefined,
    'Bearer expired',
    'Bearer customer',
    'Bearer disabled',
    'plain-token',
  ])('拒绝未登录、失效、用户或停用身份：%s', async (authorization) => {
    const call = request(app.getHttpServer()).get('/api/store');
    if (authorization) call.set('Authorization', authorization);
    await call.expect(401);
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('平台分页筛选并将数据库元转换为整数分', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/store?page=2&pageSize=20&keyword=中心&enabled=false&isOpen=true',
      )
      .set('Authorization', platform)
      .expect(200);
    expect(response.body.code).toBe(200);
    expect(response.body.data).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 20,
    });
    expect(response.body.data.items[0].deliveryFee).toBe(550);
    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: expect.objectContaining({
          enabled: false,
          isOpen: true,
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('门店账号列表只能查本店', async () => {
    await request(app.getHttpServer())
      .get('/api/store')
      .set('Authorization', 'Bearer store')
      .expect(200);
    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 } }),
    );
  });

  it('门店账号可读本店，不能读取其他门店', async () => {
    await request(app.getHttpServer())
      .get('/api/store/2')
      .set('Authorization', 'Bearer store')
      .expect(200);
    prisma.store.findUnique.mockClear();
    await request(app.getHttpServer())
      .get('/api/store/9')
      .set('Authorization', 'Bearer store')
      .expect(403);
    expect(prisma.store.findUnique).not.toHaveBeenCalled();
  });

  it('新增门店正确入库并清理字段首尾空格', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send({ ...input, name: ' 中心店 ' })
      .expect(201);
    expect(response.body.data.name).toBe('中心店');
    expect(response.body.data.deliveryFee).toBe(550);
    const data = prisma.store.create.mock.calls[0][0].data;
    expect(data.deliveryFee.toFixed(2)).toBe('5.50');
    expect(data.deliveryRegions).toBeUndefined();
  });

  it.each([
    { ...input, deliveryFee: -1 },
    { ...input, deliveryFee: 5.5 },
    { ...input, deliveryFee: null },
    { ...input, enabled: null },
    { ...input, enabled: 'false' },
    { ...input, name: '  ' },
    { ...input, deliveryRegions: null },
    { ...input, extra: true },
  ])('新增拒绝非法字段：%j', async (data) => {
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(data)
      .expect(400);
    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it.each([
    'page=0',
    'page=1000001',
    'pageSize=101',
    'enabled=abc',
    'isOpen=1',
    'storeId=9',
  ])('分页查询拒绝非法参数：%s', async (query) => {
    await request(app.getHttpServer())
      .get(`/api/store?${query}`)
      .set('Authorization', platform)
      .expect(400);
  });

  it('随机编号碰撞后重新生成并成功创建', async () => {
    jest
      .spyOn(storeCode, 'generateStoreCode')
      .mockReturnValueOnce('A1B2C3')
      .mockReturnValueOnce('D4E5F6');
    prisma.store.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(input)
      .expect(201);
    expect(prisma.store.create).toHaveBeenCalledTimes(2);
    expect(prisma.store.create.mock.calls[0][0].data.code).toBe('A1B2C3');
    expect(prisma.store.create.mock.calls[1][0].data.code).toBe('D4E5F6');
  });

  it('持续编号碰撞最多尝试5次后返回503', async () => {
    prisma.store.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(input)
      .expect(503);
    expect(prisma.store.create).toHaveBeenCalledTimes(5);
  });

  it('新增自动生成六位字母数字编号', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(input)
      .expect(201);
    expect(response.body.data.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(response.body.data.code).toMatch(/[A-Z]/);
    expect(response.body.data.code).toMatch(/[0-9]/);
  });

  it('不接受前端指定或修改门店编号', async () => {
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send({ ...input, code: 'CUSTOM' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/store/2')
      .set('Authorization', platform)
      .send({ code: 'CUSTOM' })
      .expect(400);
    expect(prisma.store.create).not.toHaveBeenCalled();
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it('编辑可清空可选文本，不覆盖未提交字段', async () => {
    await request(app.getHttpServer())
      .patch('/api/store/2')
      .set('Authorization', platform)
      .send({ servicePhone: '', deliveryArea: null })
      .expect(200);
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { servicePhone: null, deliveryArea: null },
      include: {
        manager: { select: { id: true, phone: true, nickname: true } },
      },
    });
  });

  it.each([{}, { name: null }, { deliveryFee: null }, { enabled: null }])(
    '编辑拒绝空更新及必填字段null：%j',
    async (data) => {
      await request(app.getHttpServer())
        .patch('/api/store/2')
        .set('Authorization', platform)
        .send(data)
        .expect(400);
    },
  );

  it('仅修改营业状态，保留其他字段', async () => {
    await request(app.getHttpServer())
      .patch('/api/store/2/status')
      .set('Authorization', platform)
      .send({ isOpen: false })
      .expect(200);
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { isOpen: false },
      include: {
        manager: { select: { id: true, phone: true, nickname: true } },
      },
    });
  });

  it.each([{}, { isOpen: null }, { name: 'wrong' }])(
    '状态接口拒绝无效请求：%j',
    async (data) => {
      await request(app.getHttpServer())
        .patch('/api/store/2/status')
        .set('Authorization', platform)
        .send(data)
        .expect(400);
    },
  );

  it('停用保留门店，不执行物理删除', async () => {
    await request(app.getHttpServer())
      .delete('/api/store/2')
      .set('Authorization', platform)
      .expect(200);
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { enabled: false, isOpen: false },
      include: {
        manager: { select: { id: true, phone: true, nickname: true } },
      },
    });
  });

  it.each(['store', 'legacy'])('非平台角色不能维护门店：%s', async (token) => {
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/store/2/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/store/2')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(prisma.store.create).not.toHaveBeenCalled();
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it.each(['0', '-1', 'abc', '1.5'])('拒绝非法ID：%s', async (id) => {
    await request(app.getHttpServer())
      .get(`/api/store/${id}`)
      .set('Authorization', platform)
      .expect(400);
  });

  it('按手机号注册或提升店长，在同一事务中保存门店', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(input)
      .expect(201);
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { phone: input.managerPhone },
      create: {
        phone: input.managerPhone,
        role: 'STORE_MANAGER',
        inviteCode: expect.stringMatching(/^[a-f0-9]{24}$/),
      },
      update: { role: 'STORE_MANAGER' },
      select: { id: true, enabled: true },
    });
    const data = prisma.store.create.mock.calls[0][0].data;
    expect(data.manager).toEqual({ connect: { id: 100 } });
    expect(data.managerPhone).toBeUndefined();
    expect(response.body.data.managerPhone).toBe(input.managerPhone);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('同一手机号可连续设置到多家门店，复用同一用户', async () => {
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(input)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send({ ...input, name: '第二家门店' })
      .expect(201);
    expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    expect(
      prisma.store.create.mock.calls.every(
        (call) => call[0].data.manager.connect.id === 100,
      ),
    ).toBe(true);
  });

  it.each(['', 'abc', '123456', null])(
    '拒绝无效店长手机号：%s',
    async (managerPhone) => {
      await request(app.getHttpServer())
        .post('/api/store')
        .set('Authorization', platform)
        .send({ ...input, managerPhone })
        .expect(400);
      await request(app.getHttpServer())
        .patch('/api/store/2')
        .set('Authorization', platform)
        .send({ managerPhone })
        .expect(400);
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    },
  );

  it('新增必须提供店长手机号', async () => {
    const { managerPhone, ...withoutManager } = input;
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(withoutManager)
      .expect(400);
  });

  it('停用用户不能设置为店长，门店不写入', async () => {
    prisma.user.upsert.mockResolvedValueOnce({ id: 100, enabled: false });
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(input)
      .expect(409);
    expect(prisma.store.create).not.toHaveBeenCalled();
  });

  it('编辑不传手机号时保留店长，不触碰用户身份', async () => {
    await request(app.getHttpServer())
      .patch('/api/store/2')
      .set('Authorization', platform)
      .send({ name: '新店名' })
      .expect(200);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.store.update.mock.calls[0][0].data.manager).toBeUndefined();
  });

  it('更换店长后旧店长仍有其他门店，保留店长身份', async () => {
    prisma.user.upsert.mockResolvedValueOnce({ id: 101, enabled: true });
    prisma.store.count.mockResolvedValueOnce(1);
    await request(app.getHttpServer())
      .patch('/api/store/2')
      .set('Authorization', platform)
      .send({ managerPhone: '13700000000' })
      .expect(200);
    expect(prisma.store.update.mock.calls[0][0].data.manager).toEqual({
      connect: { id: 101 },
    });
    expect(prisma.store.count).toHaveBeenCalledWith({
      where: { managerId: 100 },
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('旧店长不再负责任何门店时恢复普通用户身份', async () => {
    prisma.user.upsert.mockResolvedValueOnce({ id: 101, enabled: true });
    prisma.store.count.mockResolvedValueOnce(0);
    await request(app.getHttpServer())
      .patch('/api/store/2')
      .set('Authorization', platform)
      .send({ managerPhone: '13700000000' })
      .expect(200);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 100, role: 'STORE_MANAGER' },
      data: { role: 'CUSTOMER' },
    });
  });

  it('小程序店长可读取全部负责门店，但不能跨店或维护平台资料', async () => {
    await request(app.getHttpServer())
      .get('/api/store')
      .set('Authorization', 'Bearer manager')
      .expect(200);
    expect(prisma.store.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [2, 7] } } }),
    );
    await request(app.getHttpServer())
      .get('/api/store/7')
      .set('Authorization', 'Bearer manager')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/store/9')
      .set('Authorization', 'Bearer manager')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', 'Bearer manager')
      .send(input)
      .expect(403);
  });

  it('店长被撤换后旧令牌不能继续读门店', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 100,
      enabled: true,
      role: 'CUSTOMER',
      managedStores: [],
    });
    await request(app.getHttpServer())
      .get('/api/store')
      .set('Authorization', 'Bearer manager')
      .expect(401);
    expect(prisma.store.findMany).not.toHaveBeenCalled();
  });

  it('并发事务冲突后整体重试', async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );
    await request(app.getHttpServer())
      .post('/api/store')
      .set('Authorization', platform)
      .send(input)
      .expect(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('不存在的门店返回404', async () => {
    prisma.store.findUnique.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/api/store/9')
      .set('Authorization', platform)
      .expect(404);
    prisma.store.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    await request(app.getHttpServer())
      .patch('/api/store/9')
      .set('Authorization', platform)
      .send({ name: '不存在' })
      .expect(404);
  });
});
