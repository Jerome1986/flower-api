// 只读联调检查：核对公开接口与数据库中的门店选品、规格及库存一致。
require('dotenv/config');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const url = new URL(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({
  host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)),
}) });
const base = 'http://localhost:3000/api/shop/stores';
async function get(path = '') {
  const response = await fetch(base + path);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.code, 200);
  return body.data;
}
async function main() {
  const stores = await get();
  const dbStores = await prisma.store.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  assert.deepEqual(stores.map(s => s.id), dbStores.map(s => s.id));
  let productsChecked = 0;
  let specsChecked = 0;
  for (const store of dbStores) {
    const detail = await get(`/${store.id}`);
    assert.equal(detail.isOpen, store.isOpen);
    assert.equal(detail.deliveryFee, Math.round(Number(store.deliveryFee) * 100));
    assert.equal('managerId' in detail, false);
    const products = await get(`/${store.id}/products`);
    const expected = await prisma.storeProduct.findMany({
      where: { storeId: store.id, enabled: true, OR: [{ pickupEnabled: true }, { deliveryEnabled: true }],
        product: { enabled: true, specs: { some: { enabled: true } } } },
      include: { product: { include: { specs: { where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } }, stocks: true },
      orderBy: [{ product: { sortOrder: 'asc' } }, { id: 'asc' }],
    });
    assert.deepEqual(products.map(p => p.id), expected.map(p => p.productId));
    for (let i = 0; i < products.length; i++) {
      const item = products[i];
      const row = expected[i];
      assert.deepEqual(await get(`/${store.id}/products/${item.id}`), item);
      assert.equal(item.pickupEnabled, row.pickupEnabled);
      assert.equal(item.deliveryEnabled, row.deliveryEnabled);
      assert.deepEqual(item.specs.map(s => s.id), row.product.specs.map(s => s.id));
      for (let j = 0; j < item.specs.length; j++) {
        const spec = item.specs[j];
        assert.equal(spec.price, Math.round(Number(row.product.specs[j].price) * 100));
        assert.equal(spec.available, row.stocks.find(s => s.specId === spec.id)?.available ?? 0);
        specsChecked++;
      }
      productsChecked++;
    }
  }
  assert.equal((await fetch(base + '/not-a-number/products')).status, 400);
  assert.equal((await fetch(base + '/2147483647/products')).status, 404);
  const disabled = await prisma.store.findFirst({ where: { enabled: false } });
  if (disabled) assert.equal((await fetch(base + `/${disabled.id}/products`)).status, 404);
  console.log(JSON.stringify({ storesChecked: stores.length, productsChecked, specsChecked, result: '通过' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
