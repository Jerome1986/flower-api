// 使用真实数据库验证活动设置，所有变更最终回滚。
require('dotenv/config');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { MarketingActivityService } = require('../dist/src/marketing-activity/marketing-activity.service');
const url = new URL(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)) }) });
const marker = `activity-check-${randomUUID().slice(0, 8)}`;
const rollback = new Error('ROLLBACK_ACTIVITY_CHECK');

// 验证活动保存、唯一配置、启停、金额和权限并确认恢复原始数据。
async function main() {
  // 1. 记录原配置，验证事务结束后完全恢复。
  const before = await prisma.marketingActivity.findMany({ orderBy: { id: 'asc' } });
  try {
    await prisma.$transaction(async tx => {
      // 2. 服务中的事务复用当前回滚事务。
      const proxy = new Proxy(tx, { get(target, key) { if (key === '$transaction') return fn => fn(tx); return Reflect.get(target, key); } });
      const service = new MarketingActivityService(proxy);
      const admin = { id: 1, username: marker, role: 'PLATFORM_ADMIN', storeId: null };
      const template = await tx.couponTemplate.create({ data: { name: marker, type: 'CASH', cashAmount: '9.90', validityHours: 720, enabled: true } });
      const input = { name: marker, templateId: template.id, enabled: true, isFlowerGift: false, reimbursementPerUnit: null };
      // 3. 两种触发方式分别保存，重复保存同一活动仍使用原记录。
      const first = await service.save('NEW_USER', input, admin);
      const next = await service.save('NEW_USER', { ...input, name: `${marker}-edited` }, admin);
      assert.equal(first.id, next.id);
      assert.equal(next.template.cashAmount, 990);
      assert.equal(next.template.validityHours, 720);
      assert.equal(next.template.available, true);
      assert.equal((await service.status('NEW_USER', true, admin)).enabled, true);
      assert.equal(next.reimbursementPerUnit, null);
      await service.save('INVITATION', input, admin);
      assert.equal((await service.list(admin)).length, 2);
      // 4. 停用奖励券后不能启用活动，但允许关闭活动。
      await tx.couponTemplate.update({ where: { id: template.id }, data: { enabled: false } });
      await assert.rejects(service.status('NEW_USER', true, admin));
      assert.equal((await service.status('NEW_USER', false, admin)).enabled, false);
      await assert.rejects(service.save('INVITATION', { ...input, isFlowerGift: true }, admin));
      await assert.rejects(service.list({ ...admin, role: 'STORE_MANAGER' }));
      // 5. 主动回滚，既有活动和临时模板均不持久化。
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.deepEqual(await prisma.marketingActivity.findMany({ orderBy: { id: 'asc' } }), before);
  assert.equal(await prisma.couponTemplate.count({ where: { name: marker } }), 0);
  console.log('活动设置真实数据库验证通过，所有测试变更已回滚。');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
