require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const { PrismaMariaDb } = require('@prisma/adapter-mariadb')
const url = new URL(process.env.DATABASE_URL)
const db = new PrismaClient({ adapter: new PrismaMariaDb({ host: url.hostname, port: Number(url.port || 3306),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)) }) })
const output = v => console.log(JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2))
async function main() {
  output(await db.$queryRawUnsafe('SELECT VERSION() AS version, DATABASE() AS db, @@lower_case_table_names AS lower_case_table_names'))
  output(await db.$queryRawUnsafe(`SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE, r.UPDATE_RULE
    FROM information_schema.KEY_COLUMN_USAGE k LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
    WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND (k.CONSTRAINT_NAME IN ('user_coupon_template_id_fkey','order_item_order_id_fkey')
    OR (k.TABLE_NAME IN ('user_coupon','order_item') AND k.REFERENCED_TABLE_NAME IS NOT NULL))`))
  for (const table of ['user_coupon', 'order_item']) output(await db.$queryRawUnsafe('SHOW CREATE TABLE `' + table + '`'))
  output(await db.$queryRawUnsafe("SELECT 'user_coupon' AS table_name, COUNT(*) AS row_count FROM user_coupon UNION ALL SELECT 'order_item', COUNT(*) FROM order_item UNION ALL SELECT 'order', COUNT(*) FROM `order`"))
  output(await db.$queryRawUnsafe("SELECT 'coupon_template' AS relation_name, COUNT(*) AS orphan_count FROM user_coupon c LEFT JOIN coupon_template t ON t.id=c.template_id WHERE t.id IS NULL UNION ALL SELECT 'order_item_order', COUNT(*) FROM order_item i LEFT JOIN `order` o ON o.id=i.order_id WHERE o.id IS NULL"))
}
main().catch(e => { console.error(e.code || e.name, e.message?.replaceAll(process.env.DATABASE_URL, '[DATABASE_URL]')); process.exitCode = 1 }).finally(() => db.$disconnect())
