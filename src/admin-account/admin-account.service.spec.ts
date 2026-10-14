import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAccountRepository } from './admin-account.repository';
import { AdminAccountService } from './admin-account.service';

describe('AdminAccountService', () => {
  const actor = {
    id: 1,
    username: 'owner',
    displayName: null,
    role: 'SUPER_ADMIN',
    storeId: null,
    status: true,
  } as const;
  const admin: CurrentAdmin = actor;
  const input = {
    username: 'staff',
    displayName: ' 工作人员 ',
    role: 'PLATFORM_ADMIN' as const,
    status: true,
  };
  let service: AdminAccountService;
  let db: any;
  let target: any;
  let current: any;
  beforeEach(() => {
    current = { ...actor };
    target = { id: 2, ...input, storeId: null };
    db = {
      admin: {
        findUnique: jest.fn(async ({ where }) =>
          where.id === 1 ? current : target,
        ),
        findMany: jest.fn(async () => [target]),
        count: jest.fn(async () => 1),
        create: jest.fn(async ({ data }) => {
          const { password: _password, ...safe } = data;
          return { id: 2, ...safe };
        }),
        update: jest.fn(async ({ data }) => {
          const { password: _password, ...safe } = data;
          return { ...target, ...safe };
        }),
      },
      $transaction: jest.fn(async (arg) =>
        typeof arg === 'function' ? arg(db) : Promise.all(arg),
      ),
    };
    service = new AdminAccountService(
      new AdminAccountRepository(db as PrismaService),
    );
  });
  it('门店账号无权查询和创建后台账号', async () => {
    const manager = { ...admin, role: 'STORE_MANAGER' as const };
    await expect(
      service.list({ page: 1, pageSize: 10 }, manager),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.create({ ...input, password: 'secret123' }, manager),
    ).rejects.toThrow(ForbiddenException);
  });
  it('账号列表支持关键字和停用筛选并排除密码字段', async () => {
    await service.list(
      { page: 2, pageSize: 10, keyword: ' staff ', status: false },
      admin,
    );
    const args = db.admin.findMany.mock.calls[0][0];
    expect(args).toMatchObject({
      skip: 10,
      where: {
        status: false,
        OR: [
          { username: { contains: 'staff' } },
          { displayName: { contains: 'staff' } },
        ],
      },
    });
    expect(args.select.password).toBeUndefined();
  });
  it('创建时加密密码并清理显示名称', async () => {
    const result = await service.create(
      { ...input, password: 'secret123' },
      admin,
    );
    const data = db.admin.create.mock.calls[0][0].data;
    expect(data.displayName).toBe('工作人员');
    expect(data.password).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', data.password)).toBe(true);
    expect(result).not.toHaveProperty('password');
  });
  it('重复账号统一返回冲突提示', async () => {
    db.admin.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    await expect(
      service.create({ ...input, password: 'secret123' }, admin),
    ).rejects.toThrow(ConflictException);
  });
  it('平台管理员不能创建超级管理员', async () => {
    await expect(
      service.create(
        { ...input, role: 'SUPER_ADMIN', password: 'secret123' },
        { ...admin, role: 'PLATFORM_ADMIN' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('平台管理员不能重置超级管理员密码', async () => {
    current.role = 'PLATFORM_ADMIN';
    target.role = 'SUPER_ADMIN';
    await expect(
      service.resetPassword(2, 'secret123', {
        ...admin,
        role: 'PLATFORM_ADMIN',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.admin.update).not.toHaveBeenCalled();
  });
  it('平台管理员不能编辑、升级或停用超级管理员', async () => {
    current.role = 'PLATFORM_ADMIN';
    const platform = { ...admin, role: 'PLATFORM_ADMIN' as const };
    await expect(
      service.update(2, { ...input, role: 'SUPER_ADMIN' }, platform),
    ).rejects.toThrow(ForbiddenException);
    target.role = 'SUPER_ADMIN';
    await expect(service.update(2, input, platform)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.status(2, false, platform)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('不能停用自己或修改自己的角色', async () => {
    await expect(service.status(1, false, admin)).rejects.toThrow(
      '不能停用当前登录账号或修改自己的角色',
    );
    await expect(service.update(1, input, admin)).rejects.toThrow(
      BadRequestException,
    );
  });
  it('保留最后一个可用超级管理员', async () => {
    target.role = 'SUPER_ADMIN';
    db.admin.count.mockResolvedValue(0);
    await expect(service.status(2, false, admin)).rejects.toThrow(
      '至少需要保留一个启用的超级管理员',
    );
    await expect(service.update(2, input, admin)).rejects.toThrow(
      BadRequestException,
    );
  });
  it('停用账号只更新状态并保留原业务关联', async () => {
    await expect(service.status(2, false, admin)).resolves.toMatchObject({
      status: false,
    });
    expect(db.admin.update.mock.calls[0][0].data).toEqual({ status: false });
  });
  it('编辑旧角色转换为平台账号时清除门店绑定', async () => {
    target.role = 'STORE_ADMIN';
    target.storeId = 3;
    await expect(service.update(2, input, admin)).resolves.toMatchObject({
      storeId: null,
      role: 'PLATFORM_ADMIN',
    });
  });
  it.each(['123', ' '.repeat(6), '花'.repeat(25)])(
    '拒绝不合规密码',
    async (password) => {
      await expect(service.resetPassword(2, password, admin)).rejects.toThrow(
        BadRequestException,
      );
    },
  );
  it('拒绝不存在或无效编号', async () => {
    await expect(service.detail(-1, admin)).rejects.toThrow(
      BadRequestException,
    );
    target = null;
    await expect(service.detail(2, admin)).rejects.toThrow(NotFoundException);
  });
  it('写入时重新校验操作人当前权限', async () => {
    current.role = 'CUSTOMER_SERVICE';
    await expect(service.status(2, false, admin)).rejects.toThrow(
      ForbiddenException,
    );
  });
  it('串行事务冲突可以重试', async () => {
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('retry', {
        code: 'P2034',
        clientVersion: '7',
      }),
    );
    await expect(service.status(2, false, admin)).resolves.toMatchObject({
      status: false,
    });
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(db.$transaction.mock.calls[1][1]).toEqual({
      isolationLevel: 'Serializable',
    });
  });
});
