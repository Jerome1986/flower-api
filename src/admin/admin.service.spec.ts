jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AdminService } from './admin.service';

describe('AdminService login', () => {
  let repo: any;
  let jwt: any;
  let service: AdminService;
  let account: any;
  beforeEach(async () => {
    account = {
      id: 1,
      username: 'admin',
      password: await bcrypt.hash('Secret123!', 4),
      role: 'SUPER_ADMIN',
      displayName: '管理员',
      storeId: null,
      status: true,
    };
    repo = {
      findOneAdmin: jest.fn(async () => account),
      countAdmins: jest.fn(async () => 1),
      createDefaultAdmin: jest.fn(async () => account),
      recordLogin: jest.fn(),
    };
    jwt = { sign: jest.fn(() => 'signed-token') };
    service = new AdminService(repo, jwt);
  });
  it('登录签发密码指纹并记录最近登录时间', async () => {
    const result = await service.login({
      username: 'admin',
      password: 'Secret123!',
    });
    expect(repo.recordLogin).toHaveBeenCalledWith(1);
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordVersion: createHash('sha256')
          .update(account.password)
          .digest('hex'),
      }),
    );
    expect(result.userInfo).not.toHaveProperty('password');
  });
  it('默认账号重命名后不重新初始化', async () => {
    repo.findOneAdmin.mockImplementation(async (username) =>
      username === 'admin' ? null : { ...account, username: 'owner' },
    );
    await expect(
      service.login({ username: 'owner', password: 'Secret123!' }),
    ).resolves.toMatchObject({ token: 'signed-token' });
    expect(repo.createDefaultAdmin).not.toHaveBeenCalled();
  });
  it('只有空账号表才允许首次初始化', async () => {
    repo.findOneAdmin.mockResolvedValue(null);
    repo.countAdmins.mockResolvedValue(0);
    await service.login({ username: 'admin', password: 'Secret123!' });
    expect(repo.createDefaultAdmin).toHaveBeenCalledTimes(1);
  });
  it('错误密码不记录成功登录也不签发令牌', async () => {
    await expect(
      service.login({ username: 'admin', password: 'wrong-password' }),
    ).rejects.toThrow('密码错误');
    expect(repo.recordLogin).not.toHaveBeenCalled();
    expect(jwt.sign).not.toHaveBeenCalled();
  });
  it('停用账号不能登录', async () => {
    account.status = false;
    await expect(
      service.login({ username: 'admin', password: 'Secret123!' }),
    ).rejects.toThrow('账号已停用');
    expect(jwt.sign).not.toHaveBeenCalled();
  });
});
