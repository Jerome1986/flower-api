require('dotenv/config');
const assert = require('node:assert/strict');
const { randomUUID, createHmac, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
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
const tag = randomUUID().slice(0, 8);
const storeIds = [];
let managerId;
let checks = 0;
function sign(payload) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 600 }),
  ).toString('base64url');
  return (
    header +
    '.' +
    body +
    '.' +
    createHmac('sha256', process.env.SECRET ?? 'jerome1986')
      .update(header + '.' + body)
      .digest('base64url')
  );
}
async function api(path, token, method = 'GET', data, expected = 200) {
  const res = await fetch('http://localhost:3000/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body = await res.json();
  assert.equal(res.status, expected, JSON.stringify(body));
  checks++;
  return body.data;
}
async function main() {
  const customer = await prisma.user.findUniqueOrThrow({
    where: { phone: '15527650094' },
  });
  const userToken = sign({ type: 'user', userId: customer.id });
  const otherCustomer = await prisma.user.findUniqueOrThrow({
    where: { phone: '17502175260' },
  });
  const otherUserToken = sign({ type: 'user', userId: otherCustomer.id });
  const manager = await prisma.user.create({
    data: {
      phone: 'test-manager-' + tag,
      role: 'STORE_MANAGER',
      inviteCode: 'test-' + tag,
    },
  });
  managerId = manager.id;
  const managerToken = sign({ type: 'user', userId: manager.id });
  const admin = await prisma.admin.findFirstOrThrow({
    where: { role: { in: ['SUPER_ADMIN', 'PLATFORM_ADMIN'] }, status: true },
  });
  const adminToken = sign({
    type: 'admin',
    userId: admin.id,
    passwordVersion: createHash('sha256').update(admin.password).digest('hex'),
  });
  const spec = await prisma.productSpec.findFirstOrThrow({
    where: { enabled: true, product: { enabled: true } },
  });
  for (let i = 0; i < 2; i++) {
    const store = await prisma.store.create({
      data: {
        code: 'test-orders-' + tag + '-' + i,
        name: '订单联调临时门店' + i,
        address: '临时测试地址',
        phone: '15527650094',
        businessHours: '测试营业',
        managerId: i === 0 ? manager.id : null,
        deliveryFee: 5,
      },
    });
    storeIds.push(store.id);
    const selected = await prisma.storeProduct.create({
      data: {
        storeId: store.id,
        productId: spec.productId,
        enabled: true,
        pickupEnabled: true,
        deliveryEnabled: true,
      },
    });
    await prisma.storeStock.create({
      data: {
        storeProductId: selected.id,
        productId: spec.productId,
        specId: spec.id,
        available: 20,
      },
    });
  }
  async function create(method, index = 0) {
    const selection = {
      storeId: storeIds[index],
      productId: spec.productId,
      specId: spec.id,
      quantity: 1,
      method,
    };
    const quote = await api('/user/orders/quote', userToken, 'POST', selection);
    return api(
      '/user/orders',
      userToken,
      'POST',
      {
        ...selection,
        requestKey: randomUUID(),
        contactName: '订单管理测试',
        contactPhone: customer.phone,
        address: method === 'delivery' ? '测试配送地址' : '',
        expectedAmount: quote.payableAmount,
      },
      201,
    );
  }
  async function action(
    order,
    name,
    extra = {},
    token = managerToken,
    expected = 200,
  ) {
    const result = await api(
      '/admin/orders/' + order.orderNo + '/actions',
      token,
      'POST',
      { action: name, version: order.version, ...extra },
      expected,
    );
    if (expected === 200) {
      const userView = await api('/user/orders/' + order.orderNo, userToken);
      assert.equal(userView.status, result.status);
      assert.equal(userView.version, result.version);
      assert.equal(result.pickupCode, null);
      if (result.status !== 'READY' || result.method !== 'PICKUP')
        assert.equal(userView.pickupCode, null);
    }
    return result;
  }
  const pickup = await create('pickup');
  assert.equal(pickup.pickupCode, null);
  await api(
    '/user/orders/' + pickup.orderNo,
    otherUserToken,
    'GET',
    undefined,
    404,
  );
  await api(
    '/user/orders/' + pickup.orderNo + '/cancel',
    otherUserToken,
    'POST',
    undefined,
    404,
  );
  const foreign = await create('pickup', 1);
  await api('/admin/orders', userToken, 'GET', undefined, 401);
  assert.equal((await api('/admin/orders/stores', managerToken)).length, 1);
  const own = await api('/admin/orders', managerToken);
  const paged = await api(
    '/admin/orders?page=1&pageSize=1&statusGroup=unpaid',
    managerToken,
  );
  assert.equal(paged.list.length, 1);
  assert.ok(paged.list.every((order) => order.status === 'PENDING_PAYMENT'));
  assert.ok(own.list.some((o) => o.id === pickup.id));
  assert.equal(
    own.list.some((o) => o.id === foreign.id),
    false,
  );
  assert.equal(
    (await api('/admin/orders?storeId=' + storeIds[1], managerToken)).total,
    0,
  );
  await api(
    '/admin/orders/' + foreign.orderNo,
    managerToken,
    'GET',
    undefined,
    404,
  );
  await action(foreign, 'accept', {}, managerToken, 404);
  let p = pickup;
  assert.equal(p.status, 'PENDING_ACCEPTANCE');
  assert.equal(p.paymentStatus, 'PENDING');
  await action(p, 'ready', {}, managerToken, 409);
  const stale = p;
  p = await action(p, 'accept');
  await action(stale, 'ready', {}, managerToken, 409);
  p = await action(p, 'ready');
  assert.equal(p.pickupCode, null);
  const userDetail = await api('/user/orders/' + p.orderNo, userToken);
  assert.match(userDetail.pickupCode, /^\d{6}$/);
  await action(p, 'complete', { pickupCode: '000000' }, managerToken, 409);
  await action(p, 'complete', { pickupCode: 'abc' }, managerToken, 400);
  p = await action(p, 'complete', { pickupCode: userDetail.pickupCode });
  assert.equal(p.status, 'COMPLETED');
  assert.equal(p.fulfilledStoreId, storeIds[0]);
  assert.equal(p.paymentStatus, 'PENDING');
  await action(p, 'complete', { pickupCode: userDetail.pickupCode });
  await action(p, 'cancel', {}, managerToken, 409);
  const log = await prisma.inventoryLog.findMany({
    where: { orderId: p.id, type: 'CONSUME' },
  });
  assert.equal(log.length, 1);
  let delivery = await create('delivery');
  for (const next of ['accept', 'ready', 'deliver', 'complete'])
    delivery = await action(delivery, next);
  assert.equal(delivery.status, 'COMPLETED');
  let cancelled = await create('pickup');
  for (const next of ['accept', 'cancel'])
    cancelled = await action(cancelled, next);
  assert.equal(cancelled.status, 'CANCELLED');
  const ended = await api('/admin/orders?statusGroup=cancelled', managerToken);
  assert.ok(ended.list.some((order) => order.id === cancelled.id));
  assert.ok(
    ended.list.every((order) => ['CANCELLED', 'CLOSED'].includes(order.status)),
  );
  let readyCancel = await create('pickup');
  for (const next of ['accept', 'ready', 'cancel'])
    readyCancel = await action(readyCancel, next);
  const cancelledUser = await api(
    '/user/orders/' + readyCancel.orderNo,
    userToken,
  );
  assert.equal(cancelledUser.pickupCode, null);
  await action(
    readyCancel,
    'complete',
    { pickupCode: '000000' },
    managerToken,
    409,
  );
  const expired = await create('pickup');
  await prisma.order.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await action(expired, 'accept', {}, managerToken, 409);
  await api('/user/orders/' + expired.orderNo + '/cancel', userToken, 'POST');
  let race = await create('pickup');
  for (const next of ['accept', 'ready']) race = await action(race, next);
  const raceUser = await api('/user/orders/' + race.orderNo, userToken);
  const outcomes = await Promise.all(
    ['complete', 'cancel'].map(async (name) => {
      const res = await fetch(
        'http://localhost:3000/api/admin/orders/' + race.orderNo + '/actions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + managerToken,
          },
          body: JSON.stringify({
            action: name,
            version: race.version,
            ...(name === 'complete' ? { pickupCode: raceUser.pickupCode } : {}),
          }),
        },
      );
      return res.status;
    }),
  );
  assert.equal(outcomes.filter((code) => code === 200).length, 1);
  assert.equal(outcomes.filter((code) => code === 409).length, 1);
  const racedOrder = await api('/user/orders/' + race.orderNo, userToken);
  const consumed = racedOrder.status === 'COMPLETED' ? 3 : 2;
  await action(foreign, 'cancel', {}, adminToken);
  const stock = await prisma.storeStock.findFirstOrThrow({
    where: { storeProduct: { storeId: storeIds[0] } },
  });
  assert.equal(stock.available, 20 - consumed);
  assert.equal(stock.reserved, 0);
  assert.equal(
    await prisma.payment.count({
      where: { order: { storeId: { in: storeIds } } },
    }),
    0,
  );
  assert.ok(p.logs.some((l) => l.action === 'complete'));
  console.log(
    JSON.stringify({
      result: '通过',
      apiChecks: checks,
      pickup: true,
      delivery: true,
      cancellation: true,
      storeIsolation: true,
      userStatusConsistent: true,
      expiredConfirmationRejected: true,
      cancelledCodeInvalidated: true,
      completionCancelRace: true,
      paymentCreated: false,
    }),
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // 仅清理本脚本创建的临时门店、账号及关联测试订单。
    const where = { storeId: { in: storeIds } };
    await prisma.$transaction(async (tx) => {
      await tx.inventoryLog.deleteMany({ where: { order: where } });
      await tx.orderLog.deleteMany({ where: { order: where } });
      await tx.orderItem.deleteMany({ where: { order: where } });
      await tx.order.deleteMany({ where });
      await tx.storeStock.deleteMany({
        where: { storeProduct: { storeId: { in: storeIds } } },
      });
      await tx.storeProduct.deleteMany({
        where: { storeId: { in: storeIds } },
      });
      await tx.store.deleteMany({ where: { id: { in: storeIds } } });
      if (managerId) await tx.user.delete({ where: { id: managerId } });
    });
    await prisma.$disconnect();
  });
