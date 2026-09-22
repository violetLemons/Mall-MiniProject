/**
 * 一次性初始化云函数：创建全部数据库集合 + 灌入演示数据 + 创建超级管理员
 * 部署后手动触发一次即可，可重复执行（幂等）。
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = [
  'users', 'admins', 'auth_limits', 'products', 'product_skus',
  'categories', 'carts', 'orders', 'order_items', 'merchant_orders',
  'payment_transactions', 'refund_records', 'addresses', 'address_meta', 'favorites', 'coupons',
  'user_coupons', 'banners', 'operation_logs', 'inventory_logs', 'pickup_points'
];

const DEMO_CATEGORIES = [
  { _id: 'cat_001', name: '热销爆款', sort: 100, status: 'ACTIVE' },
  { _id: 'cat_002', name: '休闲服饰', sort: 90, status: 'ACTIVE' },
  { _id: 'cat_003', name: '数码配件', sort: 80, status: 'ACTIVE' },
  { _id: 'cat_004', name: '家居好物', sort: 70, status: 'ACTIVE' }
];

const DEMO_PRODUCTS = [
  {
    _id: 'prod_demo_001',
    name: 'Demo 经典纯棉基础 T 恤',
    title: 'Demo 经典纯棉基础 T 恤',
    brand: '基础优选',
    categoryId: 'cat_002',
    cover: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800',
    images: ['https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800'],
    minPrice: 19900,
    maxPrice: 19900,
    sales: 88,
    totalStock: 100,
    status: 'ON_SALE',
    tags: ['新品', '极速发货'],
    sort: 100,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'prod_demo_002',
    name: 'Demo 无线蓝牙降噪耳机',
    title: 'Demo 无线蓝牙降噪耳机',
    brand: '声动',
    categoryId: 'cat_003',
    cover: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
    images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800'],
    minPrice: 26900,
    maxPrice: 26900,
    sales: 156,
    totalStock: 80,
    status: 'ON_SALE',
    tags: ['爆款', '轻巧便携'],
    sort: 90,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

const DEMO_SKUS = [
  { _id: 'sku_001_40', productId: 'prod_demo_001', skuCode: 'DEMO-001-40', colorName: '经典黑', size: 40, price: 19900, stock: 25, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_001_41', productId: 'prod_demo_001', skuCode: 'DEMO-001-41', colorName: '经典黑', size: 41, price: 19900, stock: 25, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_001_42', productId: 'prod_demo_001', skuCode: 'DEMO-001-42', colorName: '经典黑', size: 42, price: 19900, stock: 25, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_001_43', productId: 'prod_demo_001', skuCode: 'DEMO-001-43', colorName: '经典黑', size: 43, price: 19900, stock: 25, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_002_41', productId: 'prod_demo_002', skuCode: 'DEMO-002-41', colorName: '活力红', size: 41, price: 26900, stock: 40, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_002_42', productId: 'prod_demo_002', skuCode: 'DEMO-002-42', colorName: '活力红', size: 42, price: 26900, stock: 40, lockedStock: 0, status: 'ACTIVE' }
];

const DEMO_BANNERS = [
  {
    _id: 'banner_001',
    title: '当季新品 · 极速包邮专场',
    subtitle: '精选品质好物 领券立减 50 元',
    imageUrl: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=1200',
    badge: '限时立减',
    targetUrl: '/pages/goods/list',
    sort: 10,
    status: 'ACTIVE'
  }
];

const DEMO_PICKUP_POINTS = [
  {
    _id: 'pt_sz_001',
    name: '示例大学校园自提站',
    address: '示例省示例市示例区示例路1号示例大学商业街',
    hours: '09:00 - 21:30',
    phone: '13800000000',
    status: 'ACTIVE'
  }
];

function hashPassword(password, salt) {
  return `scrypt$${crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
}

async function count(name) {
  try { return (await db.collection(name).count()).total; } catch (_) { return 0; }
}

async function seedIfEmpty(name, docs) {
  if ((await count(name)) > 0) return { name, status: 'skip (已有数据)' };
  let n = 0;
  for (const d of docs) {
    const { _id, ...rest } = d;
    await db.collection(name).doc(_id).set({ data: rest });
    n++;
  }
  return { name, status: `seeded ${n} 条` };
}

exports.main = async () => {
  const report = { collections: [], seeds: [] };

  // 1. 创建集合
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      report.collections.push({ name, status: 'created' });
    } catch (e) {
      const msg = String(e.errMsg || e.message || '');
      report.collections.push({ name, status: msg.includes('exist') || msg.includes('已存在') ? 'exists' : 'error: ' + msg });
    }
  }

  // 2. 灌入演示数据
  try { report.seeds.push(await seedIfEmpty('categories', DEMO_CATEGORIES)); } catch (e) { report.seeds.push({ name: 'categories', status: 'error: ' + (e.errMsg || e.message) }); }
  try { report.seeds.push(await seedIfEmpty('products', DEMO_PRODUCTS)); } catch (e) { report.seeds.push({ name: 'products', status: 'error: ' + (e.errMsg || e.message) }); }
  try { report.seeds.push(await seedIfEmpty('product_skus', DEMO_SKUS)); } catch (e) { report.seeds.push({ name: 'product_skus', status: 'error: ' + (e.errMsg || e.message) }); }
  try { report.seeds.push(await seedIfEmpty('banners', DEMO_BANNERS)); } catch (e) { report.seeds.push({ name: 'banners', status: 'error: ' + (e.errMsg || e.message) }); }
  try { report.seeds.push(await seedIfEmpty('pickup_points', DEMO_PICKUP_POINTS)); } catch (e) { report.seeds.push({ name: 'pickup_points', status: 'error: ' + (e.errMsg || e.message) }); }

  // 3. 创建超级管理员 (superadmin / admin123456)
  const ADMIN_USERNAME = 'superadmin';
  const ADMIN_PASSWORD = 'admin123456';
  const adminSalt = crypto.randomBytes(32).toString('hex');
  const adminDoc = {
    _id: 'admin_super_01',
    username: ADMIN_USERNAME,
    passwordHash: hashPassword(ADMIN_PASSWORD, adminSalt),
    salt: adminSalt,
    role: 'SUPER_ADMIN',
    permissions: ['*'],
    status: 'ACTIVE',
    failedLoginAttempts: 0,
    lockUntil: null,
    sessionVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  try {
    const existingAdmin = await db.collection('admins').where({ username: ADMIN_USERNAME }).limit(1).get();
    if (existingAdmin.data.length === 0) {
      const { _id, ...adminRest } = adminDoc;
      await db.collection('admins').doc(_id).set({ data: adminRest });
      report.admin = { username: ADMIN_USERNAME, password: ADMIN_PASSWORD, status: 'created' };
    } else {
      report.admin = { username: ADMIN_USERNAME, status: 'already exists' };
    }
  } catch (e) {
    report.admin = { username: ADMIN_USERNAME, status: 'error: ' + (e.errMsg || e.message) };
  }

  return { success: true, message: '初始化完成', ...report };
};
