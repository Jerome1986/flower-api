const {
  StoreProductRepository,
} = require('../dist/src/store-product/store-product.repository');
// 真实数据库功能验证：所有测试夹具在一个事务中执行，结束后整体回滚。
require('dotenv/config');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const {
  StoreProductService,
} = require('../dist/src/store-product/store-product.service');
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
const rollback = new Error('ROLLBACK_TEST_FIXTURES');
const marker = `verify-${randomUUID().slice(0, 8)}`;

async function main() {
  const before = await prisma.storeProduct.count();
  try {
    await prisma.$transaction(
      async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, key) {
            if (key === '$transaction')
              return (arg) =>
                typeof arg === 'function' ? arg(tx) : Promise.all(arg);
            return Reflect.get(target, key);
          },
        });
        const service = new StoreProductService(
          new StoreProductRepository(proxy),
        );
        const user = await tx.user.create({
          data: { phone: marker, inviteCode: marker, role: 'STORE_MANAGER' },
        });
        const admin = await tx.admin.create({
          data: {
            username: marker,
            password: randomUUID(),
            role: 'PLATFORM_ADMIN',
          },
        });
        const store = await tx.store.create({
          data: {
            code: marker,
            name: marker,
            address: '验证地址',
            phone: '00000000000',
            businessHours: '09:00-18:00',
            managerId: user.id,
          },
        });
        const product = await tx.product.create({
          data: {
            code: marker,
            name: marker,
            coverImage: '/verification.jpg',
            specs: {
              create: [
                { name: '8支', unit: '份', price: '39.90', stemsPerUnit: 8 },
              ],
            },
          },
          include: { specs: true },
        });
        const platform = {
          id: admin.id,
          role: 'PLATFORM_ADMIN',
          username: marker,
          storeId: null,
        };
        const manager = {
          id: user.id,
          role: 'STORE_MANAGER',
          username: marker,
          storeId: null,
        };
        const other = { ...manager, id: user.id + 1000000 };
        const settings = {
          enabled: false,
          pickupEnabled: true,
          deliveryEnabled: false,
        };
        const item = await service.create(
          { storeId: store.id, productId: product.id, ...settings },
          manager,
        );
        assert.equal(item.specs[0].available, 0);
        assert.equal(item.specs[0].price, 3990);
        await assert.rejects(
          () =>
            service.create(
              { storeId: store.id, productId: product.id, ...settings },
              platform,
            ),
          (error) => error.getStatus?.() === 409,
        );
        await assert.rejects(
          () => service.detail(item.id, other),
          (error) => error.getStatus?.() === 404,
        );
        await tx.storeStock.update({
          where: { id: item.specs[0].stockId },
          data: { reserved: 3 },
        });
        const operation = {
          available: 12,
          version: 0,
          reason: '验证库存调整',
          operationKey: randomUUID(),
        };
        const updated = await service.adjust(
          item.id,
          product.specs[0].id,
          operation,
          platform,
        );
        assert.equal(updated.specs[0].available, 12);
        assert.equal(updated.specs[0].reserved, 3);
        assert.equal(updated.specs[0].version, 1);
        await service.adjust(item.id, product.specs[0].id, operation, platform);
        assert.equal(
          await tx.inventoryLog.count({
            where: { stockId: item.specs[0].stockId },
          }),
          1,
        );
        await assert.rejects(
          () =>
            service.adjust(
              item.id,
              product.specs[0].id,
              { ...operation, available: 20, operationKey: randomUUID() },
              platform,
            ),
          (error) => error.getStatus?.() === 409,
        );
        const stock = await tx.storeStock.findUniqueOrThrow({
          where: { id: item.specs[0].stockId },
        });
        assert.equal(stock.available, 12);
        assert.equal(stock.reserved, 3);
        const newSpec = await tx.productSpec.create({
          data: {
            productId: product.id,
            name: '16支',
            unit: '份',
            price: '69.90',
          },
        });
        const expanded = await service.detail(item.id, manager);
        assert.equal(
          expanded.specs.find((spec) => spec.id === newSpec.id).stockId,
          null,
        );
        await service.adjust(
          item.id,
          newSpec.id,
          {
            available: 5,
            version: 0,
            reason: '新增规格补货',
            operationKey: randomUUID(),
          },
          manager,
        );
        const logs = await service.logs(
          item.id,
          { page: 1, pageSize: 10 },
          platform,
        );
        assert.equal(logs.total, 2);
        assert.equal(logs.list[0].operator, '店长');
        await service.update(item.id, { ...settings, enabled: true }, manager);
        const list = await service.list(
          { page: 1, pageSize: 10, storeId: store.id },
          manager,
        );
        assert.equal(list.total, 1);
        assert.equal(list.list[0].enabled, true);
        const catalog = await service.catalog(
          { page: 1, pageSize: 10, storeId: store.id, keyword: marker },
          manager,
        );
        assert.equal(catalog.list[0].selected, true);
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await prisma.storeProduct.count(), before);
  assert.equal(await prisma.store.count({ where: { code: marker } }), 0);
  assert.equal(await prisma.product.count({ where: { code: marker } }), 0);
  console.log(
    'PASS: real database selection, permissions, stock/reserved quantities, duplicate retries, stale versions, new specs, logs and settings; all fixtures rolled back',
  );
}
main()
  .catch((error) => {
    console.error(
      'FAIL:',
      error.code || error.message?.replace(/mysql:\/\/[^\s]+/g, '[database]'),
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
