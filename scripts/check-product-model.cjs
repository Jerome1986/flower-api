// 只读验证当前数据库已移除商品类型且 Prisma 查询正常，不输出连接信息或业务资料。
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const url = new URL(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({
  host: url.hostname, port: Number(url.port || 3306),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
}) });
async function main() {
  const columns = await prisma.$queryRaw`SELECT COUNT(*) AS total FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'product' AND column_name = 'type') OR (table_name = 'order_item' AND column_name = 'product_type'))`;
  if (Number(columns[0].total) !== 0) throw new Error('Legacy product type columns remain');
  await prisma.product.findMany({ take: 1, include: { category: true, specs: true } });
  await prisma.productCategory.findMany({ take: 1 });
  console.log('PASS: database type columns removed; product/category/spec queries work');
}
main().catch(error => { console.error('FAIL:', error.code || error.name); process.exitCode = 1; }).finally(() => prisma.$disconnect());
