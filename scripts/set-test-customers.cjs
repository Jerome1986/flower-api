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
  await prisma.user.updateMany({
    where: { phone: { in: ['15527650094', '17502175260'] } },
    data: { role: 'CUSTOMER' },
  });
  console.log(await prisma.user.findMany({
    where: { phone: { in: ['15527650094', '17502175260'] } },
    select: { id: true, phone: true, role: true },
  }));
}
main().catch(() => { console.error('测试账号设置失败'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
