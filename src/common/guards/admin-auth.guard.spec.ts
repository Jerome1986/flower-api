jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AdminAuthGuard } from './admin-auth.guard';

describe('AdminAuthGuard account maintenance', () => {
  let jwt: any;
  let db: any;
  let request: any;
  let context: ExecutionContext;
  let guard: AdminAuthGuard;
  beforeEach(() => {
    jwt = {
      verifyAsync: jest.fn(async () => ({
        userId: 1,
        type: 'admin',
        passwordVersion: createHash('sha256')
          .update('original-hash')
          .digest('hex'),
      })),
    };
    db = {
      admin: {
        findUnique: jest.fn(async () => ({
          id: 1,
          username: 'staff',
          role: 'PLATFORM_ADMIN',
          storeId: null,
          status: true,
          password: 'original-hash',
        })),
      },
    };
    request = { headers: { authorization: 'Bearer valid-token' } };
    context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    guard = new AdminAuthGuard(jwt, db);
  });
  it('正常令牌可以访问，密码摘要不传播到请求', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.admin).not.toHaveProperty('password');
  });
  it('重置密码后原令牌立即失效', async () => {
    db.admin.findUnique.mockResolvedValue({
      status: true,
      password: 'new-hash',
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('停用账号后原令牌不可访问', async () => {
    db.admin.findUnique.mockResolvedValue({ status: false });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it('角色变更使用数据库当前角色', async () => {
    db.admin.findUnique.mockResolvedValue({
      id: 1,
      username: 'staff',
      status: true,
      role: 'CUSTOMER_SERVICE',
      storeId: null,
      password: 'original-hash',
    });
    await guard.canActivate(context);
    expect(request.admin.role).toBe('CUSTOMER_SERVICE');
  });
  it('升级前的旧令牌要求重新登录', async () => {
    jwt.verifyAsync.mockResolvedValue({ userId: 1, type: 'admin' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
