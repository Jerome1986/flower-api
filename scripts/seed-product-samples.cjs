// 根据项目图片导入示例商品。默认只预览；--apply 上传图片并新增数据。
// 不覆盖已有同名商品；图片地址缓存以避免重复上传。
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { readFile, writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const url = new URL(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter: new PrismaMariaDb({
  host: url.hostname, port: Number(url.port || 3306),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
}) });
const assets = path.resolve(__dirname, '../../花(1)/花');
const cacheFile = path.resolve(__dirname, '../prisma/seeds/product-sample-images.json');
const uploadUrl = process.env.PRODUCT_SAMPLE_UPLOAD_URL || 'https://x08d6czkyi.sealosgzg.site/upload';
// 价格单位为元，沿用现有演示商品的基础价格；其余规格为演示配置。
const samples = [
  { key: 'rose', name: '玫瑰', description: '红色玫瑰，适合日常插花与心意赠礼。花材形态及开放程度以实际供应为准。', specs: [[8, '39.90'], [16, '69.90']] },
  { key: 'tulip', name: '郁金香', description: '缤纷郁金香，为桌面与家居添一份明亮。花色以实际供应为准。', specs: [[5, '29.90'], [10, '49.90']] },
  { key: 'sunflower', name: '向日葵', description: '明亮的向日葵，适合日常插花和祝福赠礼。花材形态以实际供应为准。', specs: [[3, '19.90'], [6, '35.90']] },
  { key: 'carnation', name: '康乃馨', description: '温柔康乃馨，适合家庭插花与节日赠礼。花色及开放程度以实际供应为准。', specs: [[5, '19.90'], [10, '35.90']] },
  { key: 'lily', name: '百合', description: '优雅百合，为日常空间增添鲜花气息。花色及开放程度以实际供应为准。', specs: [[3, '29.90'], [6, '49.90']] },
  { key: 'peony', name: '芍药', description: '层叠花瓣的芍药，适合桌面陈列与日常插花。花色及开放程度以实际供应为准。', specs: [[5, '39.90'], [10, '69.90']] },
];
async function main() {
  const apply = process.argv.includes('--apply');
  let cache = {};
  try { cache = JSON.parse(await readFile(cacheFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const before = await prisma.product.count();
  const existing = await prisma.product.findMany({ where: { name: { in: samples.map(item => item.name) } }, select: { name: true } });
  const names = new Set(existing.map(item => item.name));
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', existingProducts: before, add: samples.filter(item => !names.has(item.name)).map(item => item.name), skip: [...names] }));
  if (!apply) return;
  for (const [index, sample] of samples.entries()) {
    if (names.has(sample.name)) continue;
    let image = cache[sample.key];
    if (!image) {
      const bytes = await readFile(path.join(assets, `${sample.name}.jpg`));
      if (bytes.length > 5 * 1024 * 1024) throw new Error(`Image exceeds 5MB: ${sample.name}`);
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: 'image/jpeg' }), `flower-sample-${sample.key}.jpg`);
      const response = await fetch(uploadUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Upload failed (${response.status}): ${sample.name}`);
      const text = (await response.text()).trim();
      image = text;
      if (!/^https?:\/\//i.test(image)) {
        const result = JSON.parse(text);
        image = result.url || result.data?.url || result.data;
      }
      if (typeof image !== 'string' || !/^https?:\/\//i.test(image)) throw new Error(`Invalid image URL: ${sample.name}`);
      cache[sample.key] = image;
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, `${JSON.stringify(cache, null, 2)}\n`);
    }
    const check = await fetch(image, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    if (!check.ok || !check.headers.get('content-type')?.startsWith('image/')) throw new Error(`Image unavailable: ${sample.name}`);
    const product = await prisma.$transaction(async tx => {
      const category = await tx.productCategory.upsert({ where: { name: sample.name }, update: {}, create: { name: sample.name, enabled: true, sortOrder: (index + 1) * 10 } });
      return tx.product.create({ data: {
        code: `sample-assets:${sample.key}`, name: sample.name, categoryId: category.id,
        coverImage: image, images: [image], description: `${sample.description}\n示例商品：规格及售价为演示配置，可在后台调整。`,
        enabled: category.enabled, sortOrder: (index + 1) * 10,
        specs: { create: sample.specs.map(([stems, price], sortOrder) => ({ name: `${stems}支`, unit: '份', price, stemsPerUnit: stems, enabled: true, sortOrder })) },
      } });
    });
    console.log(`CREATED ${product.id} ${sample.name}: 2 specs, cover/detail image available`);
  }
  const records = await prisma.product.findMany({ where: { code: { startsWith: 'sample-assets:' } }, include: { category: true, specs: true }, orderBy: { sortOrder: 'asc' } });
  console.log(JSON.stringify({ productsBefore: before, productsAfter: await prisma.product.count(), samples: records.map(item => ({ id: item.id, name: item.name, category: item.category?.name, detailImages: Array.isArray(item.images) ? item.images.length : 0, specs: item.specs.map(spec => ({ name: spec.name, price: spec.price.toString(), unit: spec.unit })) })) }, null, 2));
}
main().catch(error => { console.error('FAIL:', error.message?.replace(/mysql:\/\/[^\s]+/g, '[database]')); process.exitCode = 1; }).finally(() => prisma.$disconnect());
