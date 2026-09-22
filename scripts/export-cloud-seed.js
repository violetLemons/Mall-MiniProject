/**
 * Export the bundled catalog as CloudBase import files.
 * This never writes to CloudBase and never overwrites an existing collection.
 */
const fs = require('fs');
const path = require('path');
const { MOCK_PRODUCTS } = require('../miniprogram/services/mock/products.js');
const { MOCK_CATEGORIES } = require('../miniprogram/services/mock/categories.js');

const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const outDir = path.resolve(outArg >= 0 ? args[outArg + 1] : 'work/cloud-seed');
if (!outDir || outDir === path.parse(outDir).root) throw new Error('请指定安全的输出目录');
fs.mkdirSync(outDir, { recursive: true });

const categories = MOCK_CATEGORIES.map((item, index) => ({
  _id: item.id,
  id: item.id,
  name: item.name,
  icon: item.icon,
  badge: item.badge || '',
  sort: 100 - index,
  status: 'ACTIVE'
}));

const products = MOCK_PRODUCTS.map(item => {
  const skus = Array.isArray(item.skus) ? item.skus : [];
  const prices = skus.map(sku => Number(sku.price)).filter(Number.isSafeInteger);
  return {
    _id: item.id,
    name: item.title,
    title: item.title,
    subtitle: item.subtitle || '',
    description: item.description || '',
    brand: item.brand,
    category: item.category,
    categoryId: item.categoryId,
    cover: item.cover,
    images: item.images || [],
    tags: item.tags || [],
    isHot: Boolean(item.isHot),
    isNew: Boolean(item.isNew),
    sales: Number(item.sales) || 0,
    minPrice: prices.length ? Math.min(...prices) : Number(item.price) || 0,
    maxPrice: prices.length ? Math.max(...prices) : Number(item.originalPrice || item.price) || 0,
    totalStock: skus.reduce((sum, sku) => sum + (Number(sku.stock) || 0), 0),
    skuVersion: 1,
    status: 'ON_SALE',
    deletedAt: null
  };
});

const product_skus = MOCK_PRODUCTS.flatMap(item => (item.skus || []).map(sku => ({
  _id: sku.skuId,
  productId: item.id,
  skuCode: sku.skuId,
  colorId: sku.colorId || sku.colorName,
  colorName: sku.colorName || '默认配色',
  colorImage: sku.image || item.cover,
  size: Number(sku.size),
  price: Number(sku.price),
  originalPrice: Number(sku.originalPrice || sku.price),
  stock: Number(sku.stock) || 0,
  lockedStock: 0,
  status: 'ACTIVE'
})));

const pickup_points = [{
  _id: 'pt_sz_001',
  name: '深圳大学城潮流自提站',
  address: '南山区大学城学苑大道1088号',
  hours: '09:00-22:00',
  status: 'ACTIVE'
}];

for (const [name, value] of Object.entries({ categories, products, product_skus, pickup_points })) {
  const jsonLines = value.map(doc => JSON.stringify(doc)).join('\n');
  fs.writeFileSync(path.join(outDir, `${name}.json`), jsonLines, 'utf8');
  console.log(`[Seed] ${name}: ${value.length} documents (JSON Lines) -> ${path.join(outDir, `${name}.json`)}`);
}
console.log('[Seed] 仅生成导入文件，未连接或修改任何云环境。');
