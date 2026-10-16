const {
  CouponTemplateRepository,
} = require('../dist/src/coupon-template/coupon-template.repository');
// 真实数据库验证优惠券设置，所有临时记录在同一事务中创建并最终回滚。
require('dotenv/config');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const {
  CouponTemplateService,
} = require('../dist/src/coupon-template/coupon-template.service');
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
const marker = `coupon-check-${randomUUID().slice(0, 8)}`;
const rollback = new Error('ROLLBACK_COUPON_TEST');

// 验证两种券模板、商品可售校验与历史券快照，结束后确认测试记录已回滚。
async function main() {
  // 1. 记录原有模板数量，后续仅操作当前事务创建的临时记录。
  const before = await prisma.couponTemplate.count();
  try {
    await prisma.$transaction(
      async (tx) => {
        // 2. 将服务调用绑定到测试事务，避免测试产生持久数据。
        const proxy = new Proxy(tx, {
          get(target, key) {
            if (key === '$transaction')
              return (arg) =>
                typeof arg === 'function' ? arg(tx) : Promise.all(arg);
            return Reflect.get(target, key);
          },
        });
        const service = new CouponTemplateService(new CouponTemplateRepository(proxy), proxy);
        const admin = {
          id: 1,
          role: 'PLATFORM_ADMIN',
          username: marker,
          storeId: null,
        };
        const user = await tx.user.create({
          data: { phone: marker, inviteCode: marker },
        });
        const product = await tx.product.create({
          data: {
            code: marker,
            name: marker,
            coverImage: '/verification.jpg',
            specs: { create: [{ name: '8支', unit: '份', price: '39.90' }] },
          },
          include: { specs: true },
        });
        const cashInput = {
          name: `${marker}-现金券`,
          type: 'CASH',
          cashAmount: 1990,
          exchangeSpecId: null,
          exchangeQuantity: null,
          validityHours: 120,
          enabled: true,
        };
        // 3. 验证金额精确转换、现金券新增、详情和兑换规格搜索。
        const cash = await service.save(cashInput, admin);
        assert.equal(cash.cashAmount, 1990);
        assert.equal(
          (
            await tx.couponTemplate.findUniqueOrThrow({
              where: { id: cash.id },
            })
          ).cashAmount.toString(),
          '19.9',
        );
        const options = await service.exchangeSpecs(
          { page: 1, pageSize: 10, keyword: marker },
          admin,
        );
        assert.equal(options.list[0].id, product.specs[0].id);
        assert.equal(options.list[0].price, 3990);
        // 4. 创建模拟已发现金券，编辑模板后检查原券金额和有效期不变。
        const expiresAt = new Date(Date.now() + 120 * 3600000);
        const issued = await tx.userCoupon.create({
          data: {
            code: marker,
            grantKey: marker,
            userId: user.id,
            templateId: cash.id,
            source: 'MANUAL',
            name: cash.name,
            type: 'CASH',
            scope: 'ALL',
            cashAmount: '19.90',
            expiresAt,
          },
        });
        await service.save(
          {
            ...cashInput,
            name: `${marker}-修改后`,
            cashAmount: 2990,
            validityHours: 24,
          },
          admin,
          cash.id,
        );
        await service.status(cash.id, false, admin);
        const preserved = await tx.userCoupon.findUniqueOrThrow({
          where: { id: issued.id },
        });
        assert.equal(preserved.cashAmount.toString(), '19.9');
        assert.equal(preserved.name, cash.name);
        assert.equal(preserved.expiresAt.getTime(), expiresAt.getTime());
        assert.equal(preserved.status, 'AVAILABLE');
        assert.equal((await service.detail(cash.id, admin)).issuedCount, 1);
        // 5. 验证兑换券保存、商品停售后拒绝启用，以及停用后保留原规格。
        const exchangeInput = {
          ...cashInput,
          name: `${marker}-兑换券`,
          type: 'EXCHANGE',
          cashAmount: null,
          exchangeSpecId: product.specs[0].id,
          exchangeQuantity: 2,
        };
        const exchange = await service.save(exchangeInput, admin);
        assert.equal(exchange.exchangeQuantity, 2);
        assert.equal(exchange.exchangeSpec.product.name, marker);
        await tx.product.update({
          where: { id: product.id },
          data: { enabled: false },
        });
        await assert.rejects(
          () => service.status(exchange.id, true, admin),
          (error) => error.getStatus?.() === 400,
        );
        await service.status(exchange.id, false, admin);
        await service.save(
          { ...exchangeInput, enabled: false },
          admin,
          exchange.id,
        );
        const list = await service.list(
          { page: 1, pageSize: 10, keyword: marker, enabled: false },
          admin,
        );
        assert.equal(list.total, 2);
        // 6. 验证门店账号无法访问平台优惠券设置，然后回滚所有夹具。
        await assert.rejects(
          () =>
            service.detail(cash.id, {
              ...admin,
              role: 'STORE_ADMIN',
              storeId: 1,
            }),
          (error) => error.getStatus?.() === 403,
        );
        throw rollback;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  // 7. 确认模板、商品和用户优惠券测试记录均未保留。
  assert.equal(await prisma.couponTemplate.count(), before);
  assert.equal(await prisma.product.count({ where: { code: marker } }), 0);
  assert.equal(await prisma.userCoupon.count({ where: { code: marker } }), 0);
  console.log(
    'PASS: real database cash/exchange templates, amount conversion, product validity, filters, permissions and issued-coupon snapshots; all fixtures rolled back',
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
