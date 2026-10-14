// 创建并取消专用普通订单，验证数据库事务和接口；不调用支付。
require('dotenv/config');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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
const base = 'http://localhost:3000/api';
const created = [];
let token;
let assertions = 0;
async function api(path, method = 'GET', data, auth = token, expected = 200) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const body = await res.json();
  assert.equal(res.status, expected, JSON.stringify(body));
  assertions++;
  return body.data;
}
async function main() {
  token = (
    await api('/user/test-login', 'POST', { phone: '15527650094' }, null, 201)
  ).token;
  const otherToken = (
    await api('/user/test-login', 'POST', { phone: '17502175260' }, null, 201)
  ).token;
  await api('/user/orders', 'GET', undefined, null, 401);
  const stores = await api('/shop/stores');
  let chosen;
  for (const store of stores.filter((s) => s.isOpen)) {
    const products = await api('/shop/stores/' + store.id + '/products');
    for (const product of products) {
      const spec = product.specs.find((s) => s.available > 0);
      if (spec) {
        chosen = { store, product, spec };
        break;
      }
    }
    if (chosen) break;
  }
  assert.ok(chosen, '需要至少一个已上架且有库存的规格');
  const { store, product, spec } = chosen;
  const selection = {
    storeId: store.id,
    productId: product.id,
    specId: spec.id,
    quantity: 1,
    method: product.pickupEnabled ? 'pickup' : 'delivery',
  };
  const before = await prisma.storeStock.findUniqueOrThrow({
    where: {
      storeProductId_specId: {
        storeProductId: product.storeProductId,
        specId: spec.id,
      },
    },
  });
  const quote = await api('/user/orders/quote', 'POST', selection);
  assert.equal(quote.productAmount, spec.price);
  assert.equal(
    quote.payableAmount,
    spec.price + (selection.method === 'delivery' ? store.deliveryFee : 0),
  );
  const payload = {
    ...selection,
    requestKey: randomUUID(),
    contactName: '下单联调测试',
    contactPhone: '15527650094',
    address:
      selection.method === 'delivery' ? '接口联调测试地址（不实际配送）' : '',
    remark: '自动检查专用，完成后取消',
    expectedAmount: quote.payableAmount,
  };
  await api(
    '/user/orders',
    'POST',
    { ...payload, expectedAmount: quote.payableAmount + 1 },
    token,
    409,
  );
  await api('/user/orders', 'POST', { ...payload, quantity: 0 }, token, 400);
  await api(
    '/user/orders',
    'POST',
    { ...payload, specId: 2147483647 },
    token,
    400,
  );
  const concurrent = await Promise.all(
    [1, 2].map(() => api('/user/orders', 'POST', payload, token, 201)),
  );
  const order = concurrent[0];
  assert.equal(concurrent[1].id, order.id);
  created.push(order.orderNo);
  assert.equal(order.status, 'PENDING_PAYMENT');
  assert.equal(order.paymentStatus, 'PENDING');
  const repeated = await api('/user/orders', 'POST', payload, token, 201);
  assert.equal(repeated.id, order.id);
  await api(
    '/user/orders',
    'POST',
    { ...payload, contactName: '不同内容' },
    token,
    409,
  );
  const stock = await prisma.storeStock.findUniqueOrThrow({
    where: { id: before.id },
  });
  assert.equal(stock.available, before.available - 1);
  assert.equal(stock.reserved, before.reserved + 1);
  assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 0);
  const detail = await api('/user/orders/' + order.orderNo);
  assert.equal(detail.item.specId, spec.id);
  assert.ok((await api('/user/orders')).some((o) => o.id === order.id));
  assert.equal(
    (await api('/user/orders', 'GET', undefined, otherToken)).some(
      (o) => o.id === order.id,
    ),
    false,
  );
  await api('/user/orders/' + order.orderNo, 'GET', undefined, otherToken, 404);
  await api(
    '/user/orders/' + order.orderNo + '/cancel',
    'POST',
    undefined,
    otherToken,
    404,
  );
  const cancelled = await api(
    '/user/orders/' + order.orderNo + '/cancel',
    'POST',
  );
  assert.equal(cancelled.status, 'CANCELLED');
  await api('/user/orders/' + order.orderNo + '/cancel', 'POST');
  const restored = await prisma.storeStock.findUniqueOrThrow({
    where: { id: before.id },
  });
  assert.equal(restored.available, before.available);
  assert.equal(restored.reserved, before.reserved);
  // 同时争抢当前全部库存，至多一单成功。
  if (before.available <= 999) {
    const allSelection = { ...selection, quantity: before.available };
    const allQuote = await api('/user/orders/quote', 'POST', allSelection);
    const bodies = [1, 2].map(() => ({
      ...payload,
      ...allSelection,
      requestKey: randomUUID(),
      expectedAmount: allQuote.payableAmount,
    }));
    const results = await Promise.all(
      bodies.map(async (body) => {
        const res = await fetch(base + '/user/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.status === 201) created.push(data.data.orderNo);
        return { status: res.status, data: data.data };
      }),
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 1);
    const winner = results.find((r) => r.status === 201).data;
    await api('/user/orders/' + winner.orderNo + '/cancel', 'POST');
  }
  if (product.deliveryEnabled) {
    const deliverySelection = { ...selection, method: 'delivery' };
    const deliveryQuote = await api(
      '/user/orders/quote',
      'POST',
      deliverySelection,
    );
    assert.equal(deliveryQuote.deliveryFee, store.deliveryFee);
    await api(
      '/user/orders',
      'POST',
      {
        ...payload,
        ...deliverySelection,
        address: '',
        requestKey: randomUUID(),
        expectedAmount: deliveryQuote.payableAmount,
      },
      token,
      400,
    );
    const delivery = await api(
      '/user/orders',
      'POST',
      {
        ...payload,
        ...deliverySelection,
        address: '测试配送地址',
        requestKey: randomUUID(),
        expectedAmount: deliveryQuote.payableAmount,
      },
      token,
      201,
    );
    created.push(delivery.orderNo);
    assert.equal(delivery.addressSnapshot.detail, '测试配送地址');
    await api('/user/orders/' + delivery.orderNo + '/cancel', 'POST');
  }
  if (process.argv.includes('--expiry')) {
    const expiring = await api(
      '/user/orders',
      'POST',
      { ...payload, requestKey: randomUUID() },
      token,
      201,
    );
    created.push(expiring.orderNo);
    // 仅调整本脚本刚创建的测试单，验证定时关闭不会遗留预留库存。
    await prisma.order.update({
      where: { id: expiring.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const deadline = Date.now() + 80000;
    let closed = false;
    while (Date.now() < deadline) {
      const current = await api('/user/orders/' + expiring.orderNo);
      if (current.status === 'CLOSED') {
        closed = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    assert.equal(closed, true, '超时订单应自动关闭');
  }
  const finalStock = await prisma.storeStock.findUniqueOrThrow({
    where: { id: before.id },
  });
  assert.equal(finalStock.available, before.available);
  assert.equal(finalStock.reserved, before.reserved);
  console.log(
    JSON.stringify({
      result: '通过',
      apiChecks: assertions,
      ordersEnded: created.length,
      concurrentRetryChecked: true,
      expiryChecked: process.argv.includes('--expiry'),
      stockRestored: true,
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
    for (const no of created) {
      try {
        await api('/user/orders/' + no + '/cancel', 'POST');
      } catch {
        console.error('请核对临时订单：' + no);
      }
    }
    await prisma.$disconnect();
  });
