const { SalesRepository } = require('../dist/src/sales/sales.repository'); // 真实 HTTP/JWT/MySQL 聚合验收。所有订单仅属于本次隔离门店，finally 精确清理。
require('dotenv').config({ quiet: true });
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { SalesController } = require('../dist/src/sales/sales.controller');
const { SalesService } = require('../dist/src/sales/sales.service');
const { salesRange } = require('../dist/src/sales/sales.dto');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const {
  AdminAuthGuard,
} = require('../dist/src/common/guards/admin-auth.guard');
const {
  ResponseInterceptor,
} = require('../dist/src/common/interceptors/response.interceptor');
if (process.env.NODE_ENV === 'production')
  throw new Error('禁止在正式环境执行销售统计联调');
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
const prefix = 'sales-' + randomUUID().replace(/-/g, '').slice(0, 16);
const users = [],
  stores = [],
  orders = [],
  admins = [];
let product,
  spec,
  app,
  base,
  manager,
  buyer,
  checks = 0,
  stage = '初始化';
const equal = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
class CheckModule {}
Module({
  controllers: [SalesController],
  providers: [
    SalesRepository,
    SalesService,
    AdminAuthGuard,
    { provide: PrismaService, useValue: prisma },
    { provide: JwtService, useValue: jwt },
  ],
})(CheckModule);
async function user(role) {
  const n = users.length;
  const row = await prisma.user.create({
    data: {
      phone: prefix + n,
      inviteCode: prefix + n,
      role,
      nickname: '销售统计隔离测试',
    },
  });
  users.push(row.id);
  return { ...row, token: jwt.sign({ userId: row.id, type: 'user' }) };
}
async function store(managerId) {
  const row = await prisma.store.create({
    data: {
      code: prefix + stores.length,
      name: '统计隔离验证（自动清理）',
      address: '测试地址',
      phone: '13800000000',
      businessHours: '测试',
      managerId,
      enabled: false,
      isOpen: false,
    },
  });
  stores.push(row.id);
  return row;
}
async function admin(role, storeId = null) {
  const password = randomUUID();
  const row = await prisma.admin.create({
    data: { username: prefix + admins.length, password, role, storeId },
  });
  admins.push(row.id);
  return {
    ...row,
    token: jwt.sign({
      userId: row.id,
      type: 'admin',
      passwordVersion: createHash('sha256').update(password).digest('hex'),
    }),
  };
}
async function get(
  storeId,
  period = 'today',
  token = manager.token,
  status = 200,
  extra = '',
) {
  const response = await fetch(
    base + '?storeId=' + storeId + '&period=' + period + extra,
    { headers: token ? { Authorization: 'Bearer ' + token } : {} },
  );
  equal(response.status, status, 'HTTP ' + stage);
  const body = await response.json();
  if (status === 200) equal(body.code, 200);
  return body.data;
}
let a, b, today;
async function order(change = {}, item = {}) {
  const no = prefix + '-' + orders.length;
  const row = await prisma.order.create({
    data: {
      orderNo: no,
      requestKey: no,
      userId: buyer.id,
      type: 'ORDINARY',
      storeId: a.id,
      method: 'PICKUP',
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      contactName: '自动验收',
      contactPhone: '13800000000',
      serviceSnapshot: {},
      productAmount: '100.01',
      discountAmount: '10.00',
      deliveryFee: '6.00',
      payableAmount: '96.01',
      expiresAt: today.end,
      createdAt: today.start,
      completedAt: today.start,
      fulfilledStoreId: a.id,
      ...change,
      item: {
        create: {
          specId: spec.id,
          productName: '验收商品',
          coverImage: '',
          specName: '8支',
          unit: '份',
          unitPrice: '10.00',
          quantity: 10,
          productAmount: '100.01',
          ...item,
        },
      },
    },
  });
  orders.push(row.id);
  return row;
}
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
  base = (await app.getUrl()) + '/api/admin/sales';
  manager = await user('STORE_MANAGER');
  buyer = await user('CUSTOMER');
  a = await store(manager.id);
  b = await store(manager.id);
  const foreign = await store(null);
  product = await prisma.product.create({
    data: {
      code: prefix,
      name: '销售统计隔离测试',
      coverImage: '',
      enabled: false,
    },
  });
  spec = await prisma.productSpec.create({
    data: { productId: product.id, price: '10.00', enabled: false },
  });
  const platform = await admin('PLATFORM_ADMIN'),
    legacy = await admin('STORE_ADMIN', a.id),
    support = await admin('CUSTOMER_SERVICE');
  today = salesRange('today');
  stage = '权限与参数';
  await get(a.id, 'today', '', 401);
  await get(a.id, 'today', 'invalid', 401);
  await get(a.id, 'today', buyer.token, 401);
  await get(foreign.id, 'today', manager.token, 403);
  await get(a.id, 'today', support.token, 403);
  await get(b.id, 'today', legacy.token, 403);
  await get(a.id, 'today', legacy.token);
  await get(foreign.id, 'today', platform.token);
  for (const id of ['0', '-1', '1.5', 'bad', '2147483648'])
    await get(id, 'today', manager.token, 400);
  await get(a.id, 'year', manager.token, 400);
  await get(a.id, 'today', manager.token, 400, '&unexpected=1');
  stage = '空统计';
  let result = await get(a.id);
  for (const key of [
    'amount',
    'deliveryAmount',
    'receivedAmount',
    'average',
    'count',
    'completed',
    'salesCount',
    'pending',
    'giftQuantity',
    'giftAmount',
    'giftStems',
    'giftExceptionCount',
  ])
    equal(result[key], 0, key);
  equal(result.states, []);
  equal(result.timezone, 'Asia/Shanghai');
  equal(result.start, today.start.toISOString());
  equal(result.end, today.end.toISOString());
  stage = '实收金额与分元精度';
  const paid = await order();
  result = await get(a.id);
  equal(result.amount, 9001);
  equal(result.deliveryAmount, 600);
  equal(result.receivedAmount, 9601);
  equal(result.average, 9001);
  equal(result.salesCount, 1);
  stage = '定制单、未付款单及未完成单排除';
  await order({ type: 'CUSTOM' }, { giftQuantity: 8, giftStems: 64 });
  await order({
    paymentStatus: 'PENDING',
    status: 'PENDING_PAYMENT',
    completedAt: null,
  });
  await order({ status: 'READY', completedAt: null });
  result = await get(a.id);
  equal(result.amount, 9001);
  equal(result.completed, 1);
  equal(result.count, 3);
  equal(result.pending, 1);
  equal(result.giftQuantity, 0);
  stage = '退款处理中失败保留，成功回扣';
  await prisma.order.update({
    where: { id: paid.id },
    data: { paymentStatus: 'REFUNDING' },
  });
  equal((await get(a.id)).amount, 9001);
  await prisma.order.update({
    where: { id: paid.id },
    data: { paymentStatus: 'REFUND_FAILED' },
  });
  equal((await get(a.id)).amount, 9001);
  await prisma.order.update({
    where: { id: paid.id },
    data: { paymentStatus: 'REFUNDED' },
  });
  result = await get(a.id);
  equal(result.amount, 0);
  equal(result.completed, 1);
  equal(result.salesCount, 0);
  // 支付状态尚未同步时，成功退款事实仍优先扣除。
  await prisma.order.update({
    where: { id: paid.id },
    data: { paymentStatus: 'PAID' },
  });
  const payment = await prisma.payment.create({
    data: {
      orderId: paid.id,
      outTradeNo: prefix,
      amount: '96.01',
      status: 'SUCCEEDED',
      expiresAt: today.end,
    },
  });
  const refund = await prisma.refund.create({
    data: {
      orderId: paid.id,
      paymentId: payment.id,
      outRefundNo: prefix,
      amount: '96.01',
      reason: '自动验收',
      status: 'SUCCEEDED',
      adminId: platform.id,
    },
  });
  equal((await get(a.id)).amount, 0);
  await prisma.refund.update({
    where: { id: refund.id },
    data: { status: 'FAILED' },
  });
  equal((await get(a.id)).amount, 9001);
  stage = '区间半开、完成时间与下单时间分离';
  const before = new Date(today.start.getTime() - 1);
  await order({ createdAt: before, completedAt: before });
  await order({ createdAt: today.end, completedAt: today.end });
  await order({
    createdAt: before,
    completedAt: today.start,
  });
  result = await get(a.id);
  equal(result.amount, 18002);
  equal(result.completed, 2);
  equal(result.count, 3);
  equal((await get(a.id, 'week')).amount, 27003);
  const monthStart = salesRange('month').start;
  equal(
    (await get(a.id, 'month')).amount,
    before >= monthStart ? 27003 : 18002,
  );
  stage = '赠花按履约店及历史快照，不包含额外购买和未送出';
  const gift = await order(
    {
      storeId: b.id,
      fulfilledStoreId: a.id,
      paymentStatus: 'NOT_REQUIRED',
      productAmount: '20.00',
      discountAmount: '20.00',
      deliveryFee: 0,
      payableAmount: 0,
    },
    {
      quantity: 2,
      exchangeQuantity: 2,
      giftQuantity: 2,
      giftStems: 16,
      productAmount: '20.00',
    },
  );
  await order({ completedAt: null }, { giftQuantity: 9, giftStems: 72 });
  await order(
    { fulfilledStoreId: b.id },
    { exchangeQuantity: 1, giftQuantity: 1, giftStems: 8 },
  );
  result = await get(a.id);
  equal(result.giftQuantity, 2);
  equal(result.giftStems, 16);
  equal(result.giftAmount, 2000);
  equal((await get(b.id)).giftQuantity, 1);
  equal((await get(b.id)).amount, 0);
  await prisma.order.update({
    where: { id: gift.id },
    data: { paymentStatus: 'REFUNDED', status: 'CANCELLED' },
  });
  result = await get(a.id);
  equal(result.giftQuantity, 2);
  equal(result.giftExceptionCount, 1);
  await order(
    { paymentStatus: 'REFUND_FAILED' },
    { exchangeQuantity: 1, giftQuantity: 1, giftStems: null },
  );
  result = await get(a.id);
  equal(result.giftQuantity, 3);
  equal(result.giftStems, null);
  equal(result.giftUnknownStemsCount, 1);
  equal(result.giftAmount, 3000);
  equal(result.giftExceptionCount, 2);
  stage = '历史商品改价不影响赠花价值';
  await prisma.productSpec.update({
    where: { id: spec.id },
    data: { price: '999.00', stemsPerUnit: 99 },
  });
  result = await get(a.id);
  equal(result.giftAmount, 3000);
  equal(result.giftStems, null);
  stage = '门店更换负责人立即失去统计权限';
  await prisma.store.update({ where: { id: a.id }, data: { managerId: null } });
  await get(a.id, 'today', manager.token, 403);
  await prisma.user.update({
    where: { id: manager.id },
    data: { enabled: false },
  });
  await get(b.id, 'today', manager.token, 401);
  console.log('PASS ' + checks + ' real HTTP/SQL sales assertions');
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
      await prisma.$transaction([
        prisma.refund.deleteMany({ where: { orderId: { in: orders } } }),
        prisma.payment.deleteMany({ where: { orderId: { in: orders } } }),
        prisma.orderItem.deleteMany({ where: { orderId: { in: orders } } }),
        prisma.order.deleteMany({
          where: { id: { in: orders }, orderNo: { startsWith: prefix } },
        }),
        prisma.admin.deleteMany({
          where: { id: { in: admins }, username: { startsWith: prefix } },
        }),
        prisma.productSpec.deleteMany({
          where: { id: { in: spec ? [spec.id] : [] } },
        }),
        prisma.product.deleteMany({
          where: { id: { in: product ? [product.id] : [] }, code: prefix },
        }),
        prisma.store.deleteMany({
          where: { id: { in: stores }, code: { startsWith: prefix } },
        }),
        prisma.user.deleteMany({
          where: { id: { in: users }, inviteCode: { startsWith: prefix } },
        }),
      ]);
      console.log('CLEANUP dedicated sales test records complete');
    } catch {
      console.error('CLEANUP failed; dedicated prefix=' + prefix);
      process.exitCode = 1;
    } finally {
      if (app) await app.close();
      await prisma.$disconnect();
    }
  });
