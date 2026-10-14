const {
  AddressesRepository,
} = require('../dist/src/addresses/addresses.repository');
// 真实 SQL + HTTP 隔离联调：只创建本次专用用户/地址，finally 精确清理，不碰现有账户。
require('dotenv').config({ quiet: true });
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const {
  AddressesController,
} = require('../dist/src/addresses/addresses.controller');
const { AddressesService } = require('../dist/src/addresses/addresses.service');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { UserAuthGuard } = require('../dist/src/user-auth/user-auth');
const {
  ResponseInterceptor,
} = require('../dist/src/common/interceptors/response.interceptor');
if (process.env.NODE_ENV === 'production')
  throw new Error('禁止在正式环境执行地址联调');
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
const jwt = new JwtService({
  secret: randomUUID(),
  signOptions: { expiresIn: '5m' },
});
const created = [],
  codes = [];
let app,
  base,
  checks = 0,
  stage = '初始化';
class CheckModule {}
Module({
  controllers: [AddressesController],
  providers: [
    AddressesRepository,
    AddressesService,
    UserAuthGuard,
    { provide: PrismaService, useValue: prisma },
    { provide: JwtService, useValue: jwt },
  ],
})(CheckModule);
async function user(role = 'CUSTOMER', enabled = true) {
  const code = randomUUID().replace(/-/g, '');
  const record = await prisma.user.create({
    data: {
      phone: 'addr-check-' + code.slice(0, 20),
      inviteCode: code,
      role,
      enabled,
      nickname: '地址接口自动验证',
    },
  });
  created.push(record.id);
  codes.push(code);
  return {
    id: record.id,
    token: jwt.sign({ userId: record.id, type: 'user' }),
  };
}
async function api(path, method = 'GET', data, token, expected = 200) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const body = await response.json();
  assert.equal(
    response.status,
    expected,
    method + ' ' + path + ' HTTP ' + response.status + ' expected ' + expected,
  );
  checks++;
  if (expected < 400) assert.equal(body.code, 200);
  return body.data;
}
const input = {
  name: ' 测试收花人 ',
  phone: '13800000000',
  province: '浙江省',
  city: '杭州市',
  district: '西湖区',
  detail: '测试地址（自动清理）',
  isDefault: false,
};
async function main() {
  await prisma.$connect();
  app = await NestFactory.create(CheckModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  base += '/api';
  const a = await user(),
    b = await user('STORE_MANAGER'),
    disabled = await user('CUSTOMER', false);
  const path = '/user/addresses';
  stage = '鉴权';
  await api(path, 'GET', undefined, undefined, 401);
  await api(path, 'GET', undefined, 'invalid', 401);
  await api(
    path,
    'GET',
    undefined,
    jwt.sign({ userId: a.id, type: 'admin' }),
    401,
  );
  await api(path, 'GET', undefined, disabled.token, 401);
  await api(path, 'POST', input, disabled.token, 401);
  stage = '首次创建';
  assert.deepEqual(await api(path, 'GET', undefined, a.token), []);
  const first = await api(path, 'POST', input, a.token, 201);
  assert.equal(first.isDefault, true);
  assert.equal(first.name, '测试收花人');
  assert.equal(first.userId, undefined);
  const second = await api(
    path,
    'POST',
    { ...input, detail: '第二个地址' },
    a.token,
    201,
  );
  assert.equal(second.isDefault, false);
  stage = '编辑和默认';
  const updated = await api(
    path + '/' + first.id,
    'PUT',
    { ...input, detail: '修改后的详细地址' },
    a.token,
  );
  assert.equal(updated.isDefault, false);
  assert.equal((await api(path, 'GET', undefined, a.token))[0].id, second.id);
  await api(path + '/' + first.id + '/default', 'POST', undefined, a.token);
  await api(path + '/' + first.id + '/default', 'POST', undefined, a.token);
  let list = await api(path, 'GET', undefined, a.token);
  assert.equal(list.filter((item) => item.isDefault).length, 1);
  assert.equal(list[0].id, first.id);
  stage = '跨用户隔离';
  assert.deepEqual(await api(path, 'GET', undefined, b.token), []);
  await api(path + '/' + first.id, 'PUT', input, b.token, 404);
  await api(path + '/' + first.id, 'DELETE', undefined, b.token, 404);
  await api(
    path + '/' + first.id + '/default',
    'POST',
    undefined,
    b.token,
    404,
  );
  const managerAddress = await api(path, 'POST', input, b.token, 201);
  assert.equal(managerAddress.isDefault, true);
  assert.equal((await api(path, 'GET', undefined, a.token)).length, 2);
  stage = '输入校验';
  for (const patch of [
    { userId: b.id },
    { province: '' },
    { city: ' ' },
    { district: null },
    { phone: '123' },
    { name: ' ' },
    { isDefault: 'true' },
    { detail: 'x'.repeat(501) },
    { regionCode: null },
  ])
    await api(path, 'POST', { ...input, ...patch }, a.token, 400);
  for (const id of ['0', '-1', 'abc', '1.5', '2147483648'])
    await api(path + '/' + id, 'DELETE', undefined, a.token, 400);
  stage = '并发创建';
  const concurrent = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      api(
        path,
        'POST',
        { ...input, name: '并发地址' + i, isDefault: true },
        a.token,
        201,
      ),
    ),
  );
  list = await api(path, 'GET', undefined, a.token);
  assert.equal(list.length, 8);
  assert.equal(list.filter((item) => item.isDefault).length, 1);
  stage = '并发设默认';
  await Promise.all(
    concurrent.map((item) =>
      api(path + '/' + item.id + '/default', 'POST', undefined, a.token),
    ),
  );
  list = await api(path, 'GET', undefined, a.token);
  assert.equal(list.filter((item) => item.isDefault).length, 1);
  stage = '并发取消默认';
  await Promise.all(
    concurrent.map((item) =>
      api(path + '/' + item.id, 'PUT', { ...input, isDefault: false }, a.token),
    ),
  );
  list = await api(path, 'GET', undefined, a.token);
  assert.equal(list.filter((item) => item.isDefault).length, 1);
  stage = '删除补位';
  await api(path + '/' + list[0].id, 'DELETE', undefined, a.token);
  list = await api(path, 'GET', undefined, a.token);
  assert.equal(list.filter((item) => item.isDefault).length, 1);
  for (const item of list)
    await api(path + '/' + item.id, 'DELETE', undefined, a.token);
  assert.deepEqual(await api(path, 'GET', undefined, a.token), []);
  await api(path + '/' + first.id, 'DELETE', undefined, a.token, 404);
  console.log(
    'PASS ' +
      checks +
      ' real HTTP/SQL address checks (including concurrent defaults)',
  );
}
main()
  .catch((error) => {
    console.error(
      'FAIL stage=' +
        stage +
        ' ' +
        error.name +
        (error.code ? ' code=' + error.code : ''),
    );
    if (error.name === 'AssertionError') console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (created.length) {
        await prisma.$transaction([
          prisma.userAddress.deleteMany({ where: { userId: { in: created } } }),
          prisma.user.deleteMany({
            where: { id: { in: created }, inviteCode: { in: codes } },
          }),
        ]);
        console.log(
          'CLEANUP dedicated address test users and addresses complete',
        );
      }
    } catch {
      console.error('CLEANUP failed; dedicated user IDs: ' + created.join(','));
      process.exitCode = 1;
    } finally {
      if (app) await app.close();
      await prisma.$disconnect();
    }
  });
