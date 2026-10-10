// 验证真实数据库账号维护与鉴权，临时账号在同一事务中创建并回滚。
require('dotenv/config');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { JwtService } = require('@nestjs/jwt');
const {
  AdminAccountService,
} = require('../dist/src/admin-account/admin-account.service');
const {
  AdminAuthGuard,
} = require('../dist/src/common/guards/admin-auth.guard');
const url = new URL(process.env.DATABASE_URL);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  }),
});
const marker = `account-check-${randomUUID().slice(0, 8)}`;
const rollback = new Error('ROLLBACK_ACCOUNT_CHECK');

// 验证账号增改、筛选、权限、密码和令牌失效，不留下持久测试数据。
async function main() {
  // 1. 记录原账号状态，测试只使用新建的临时账号。
  const before = await prisma.admin.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });
  try {
    await prisma.$transaction(
      async (tx) => {
        // 2. 复用外层串行事务，服务新增账号仍在最后统一回滚。
        const proxy = new Proxy(tx, {
          get(target, key) {
            if (key === '$transaction')
              return (arg) =>
                typeof arg === 'function' ? arg(tx) : Promise.all(arg);
            return Reflect.get(target, key);
          },
        });
        const service = new AdminAccountService(proxy);
        const seed = await tx.admin.create({
          data: {
            username: `${marker}-owner`,
            password: await bcrypt.hash('Owner123!', 10),
            role: 'SUPER_ADMIN',
          },
        });
        const admin = {
          id: seed.id,
          username: seed.username,
          role: seed.role,
          storeId: null,
        };
        const input = {
          username: `${marker}-staff`,
          displayName: ' 测试工作人员 ',
          role: 'PLATFORM_ADMIN',
          status: true,
        };
        // 3. 验证创建、重复账号、详情、搜索和名称编辑，不泄露密码摘要。
        const created = await service.create(
          { ...input, password: 'Staff123!' },
          admin,
        );
        assert.equal(created.displayName, '测试工作人员');
        assert.equal('password' in created, false);
        const stored = await tx.admin.findUniqueOrThrow({
          where: { id: created.id },
        });
        assert.equal(await bcrypt.compare('Staff123!', stored.password), true);
        await assert.rejects(
          service.create({ ...input, password: 'Staff123!' }, admin),
          /该账号已存在/,
        );
        assert.equal(
          (await service.detail(created.id, admin)).username,
          input.username,
        );
        assert.equal(
          (
            await service.list(
              { page: 1, pageSize: 10, keyword: input.username, status: true },
              admin,
            )
          ).total,
          1,
        );
        const edited = await service.update(
          created.id,
          { ...input, displayName: '工作人员已编辑' },
          admin,
        );
        assert.equal(edited.displayName, '工作人员已编辑');
        // 4. 使用实际 JWT 校验正常登录、账号停用及密码重置后旧令牌失效。
        const jwt = new JwtService({ secret: randomUUID() });
        const token = jwt.sign({
          userId: created.id,
          type: 'admin',
          passwordVersion: createHash('sha256')
            .update(stored.password)
            .digest('hex'),
        });
        const guard = new AdminAuthGuard(jwt, proxy);
        const request = { headers: { authorization: `Bearer ${token}` } };
        const context = { switchToHttp: () => ({ getRequest: () => request }) };
        assert.equal(await guard.canActivate(context), true);
        assert.equal('password' in request.admin, false);
        await service.status(created.id, false, admin);
        await assert.rejects(guard.canActivate(context));
        await service.status(created.id, true, admin);
        assert.equal(await guard.canActivate(context), true);
        await service.resetPassword(created.id, 'NewStaff123!', admin);
        const reset = await tx.admin.findUniqueOrThrow({
          where: { id: created.id },
        });
        assert.equal(await bcrypt.compare('Staff123!', reset.password), false);
        assert.equal(
          await bcrypt.compare('NewStaff123!', reset.password),
          true,
        );
        await assert.rejects(guard.canActivate(context));
        // 5. 验证权限边界、自停用保护和角色变更。
        await assert.rejects(
          service.status(admin.id, false, admin),
          /不能停用当前登录账号/,
        );
        const platform = {
          id: created.id,
          username: created.username,
          role: 'PLATFORM_ADMIN',
          storeId: null,
        };
        await assert.rejects(
          service.resetPassword(admin.id, 'Other123!', platform),
          /仅超级管理员/,
        );
        await assert.rejects(
          service.create(
            {
              ...input,
              username: `${marker}-forbidden`,
              role: 'SUPER_ADMIN',
              password: 'Other123!',
            },
            platform,
          ),
        );
        await service.update(
          created.id,
          { ...input, role: 'SUPER_ADMIN' },
          admin,
        );
        assert.equal(
          (await service.detail(created.id, admin)).role,
          'SUPER_ADMIN',
        );
        // 6. 回滚所有测试数据，保留原有账号状态。
        throw rollback;
      },
      { timeout: 30000, isolationLevel: 'Serializable' },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.deepEqual(
    await prisma.admin.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    }),
    before,
  );
  assert.equal(
    await prisma.admin.count({ where: { username: { startsWith: marker } } }),
    0,
  );
  console.log('后台账号真实数据库及令牌鉴权验证通过，所有测试变更已回滚。');
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
