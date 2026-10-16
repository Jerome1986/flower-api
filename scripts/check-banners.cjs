const { BannerRepository } = require('../dist/src/banner/banner.repository');
// 真实数据库验证轮播图配置，所有操作在事务结束时回滚。
require('dotenv/config');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { BannerService } = require('../dist/src/banner/banner.service');
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
const rollback = new Error('ROLLBACK_BANNERS');

// 验证轮播图保存、公开筛选、版本冲突及其他配置保留。
async function main() {
  // 1. 记录完整原配置，确保测试没有持久修改。
  const before = await prisma.platformConfig.findUnique({ where: { id: 1 } });
  try {
    await prisma.$transaction(
      async (tx) => {
        // 2. 服务保存复用测试事务，所有变更统一回滚。
        const proxy = new Proxy(tx, {
          get(target, key) {
            if (key === '$transaction') return (fn) => fn(tx);
            return Reflect.get(target, key);
          },
        });
        const service = new BannerService(new BannerRepository(proxy), proxy);
        const admin = { role: 'PLATFORM_ADMIN' };
        const initial = await service.list(admin);
        const input = [
          {
            id: randomUUID(),
            title: '测试轮播图',
            image: '/verification/banner.jpg',
            enabled: true,
            sortOrder: 20,
          },
          {
            id: randomUUID(),
            title: '停用轮播图',
            image: '/verification/disabled.jpg',
            enabled: false,
            sortOrder: 1,
          },
          {
            id: randomUUID(),
            title: '首张轮播图',
            image: 'https://example.com/banner.jpg',
            enabled: true,
            sortOrder: 10,
          },
        ];
        // 3. 保存后后台显示三张，首页仅展示两张启用图片。
        const saved = await service.save(
          {
            banners: input,
            updatedAt: initial.updatedAt?.toISOString() ?? null,
          },
          admin,
        );
        assert.equal(saved.banners.length, 3);
        assert.deepEqual(
          (await service.publicList()).map((item) => item.sortOrder),
          [10, 20],
        );
        await assert.rejects(
          service.save(
            {
              banners: [],
              updatedAt: initial.updatedAt?.toISOString() ?? null,
            },
            admin,
          ),
        );
        // 4. 清空图片仍保留其他首页内容和定制服务字段。
        await service.save(
          { banners: [], updatedAt: saved.updatedAt.toISOString() },
          admin,
        );
        const after = await tx.platformConfig.findUniqueOrThrow({
          where: { id: 1 },
        });
        assert.deepEqual(await service.publicList(), []);
        if (before) {
          for (const field of [
            'customEnabled',
            'deliveryArea',
            'deliveryFee',
            'businessHours',
            'servicePhone',
            'deliveryStaff',
          ])
            assert.equal(String(after[field]), String(before[field]));
          const previousContent = before.homeContent ?? {};
          for (const key of Object.keys(previousContent).filter(
            (key) => key !== 'banners',
          ))
            assert.deepEqual(after.homeContent[key], previousContent[key]);
        }
        // 5. 回滚并确认原始配置完整恢复。
        throw rollback;
      },
      { timeout: 30000, isolationLevel: 'Serializable' },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.deepEqual(
    await prisma.platformConfig.findUnique({ where: { id: 1 } }),
    before,
  );
  console.log('轮播图真实数据库验证通过，所有测试变更已回滚。');
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
