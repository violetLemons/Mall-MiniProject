/**
 * 一次性初始化云函数：创建全部数据库集合 + 灌入演示数据 + 创建超级管理员
 * 部署后手动触发一次即可，可重复执行（幂等）。
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = [
  'users', 'admins', 'auth_limits', 'products', 'product_skus', 'product_audit_tickets',
  'categories', 'carts', 'orders', 'order_items', 'merchant_orders',
  'payment_transactions', 'refund_records', 'activation_codes', 'activation_records',
  'addresses', 'address_meta', 'favorites', 'coupons',
  'user_coupons', 'banners', 'operation_logs', 'inventory_logs', 'pickup_points'
];

// 两级分类：parentId 为空 = 一级（主要词条），非空 = 二级（次要词条，值为一级 _id）
const DEMO_CATEGORIES = [
  // 一级分类
  { _id: 'cat_fruit', name: '新鲜水果', icon: '🍎', badge: '热卖', parentId: '', sort: 100, status: 'ACTIVE' },
  { _id: 'cat_import', name: '进口水果', icon: '🍒', badge: '精选', parentId: '', sort: 90, status: 'ACTIVE' },
  { _id: 'cat_nuts', name: '坚果零食', icon: '🥜', badge: '', parentId: '', sort: 80, status: 'ACTIVE' },
  // 二级分类（新鲜水果）
  { _id: 'cat_fruit_apple', name: '苹果', icon: '🍎', parentId: 'cat_fruit', sort: 90, status: 'ACTIVE' },
  { _id: 'cat_fruit_banana', name: '香蕉', icon: '🍌', parentId: 'cat_fruit', sort: 80, status: 'ACTIVE' },
  { _id: 'cat_fruit_citrus', name: '柑橘橙柚', icon: '🍊', parentId: 'cat_fruit', sort: 70, status: 'ACTIVE' },
  { _id: 'cat_fruit_berry', name: '莓果浆果', icon: '🫐', parentId: 'cat_fruit', sort: 60, status: 'ACTIVE' },
  // 二级分类（进口水果）
  { _id: 'cat_import_cherry', name: '车厘子', icon: '🍒', parentId: 'cat_import', sort: 90, status: 'ACTIVE' },
  { _id: 'cat_import_avocado', name: '牛油果', icon: '🥑', parentId: 'cat_import', sort: 80, status: 'ACTIVE' },
  // 二级分类（坚果零食）
  { _id: 'cat_nuts_mix', name: '每日坚果', icon: '🥜', parentId: 'cat_nuts', sort: 90, status: 'ACTIVE' },
  { _id: 'cat_nuts_dried', name: '果干蜜饯', icon: '🍑', parentId: 'cat_nuts', sort: 80, status: 'ACTIVE' }
];

const DEMO_PRODUCTS = [
  {
    _id: 'prod_apple_fuji',
    name: '烟台红富士苹果',
    title: '烟台红富士苹果',
    brand: '果园直供',
    categoryId: 'cat_fruit_apple',
    cover: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=800',
    images: ['https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=800'],
    minPrice: 3990,
    maxPrice: 5990,
    sales: 320,
    totalStock: 320,
    status: 'ON_SALE',
    tags: ['新鲜', '脆甜'],
    sort: 100,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'prod_banana_hi',
    name: '海南香蕉',
    title: '海南香蕉',
    brand: '海南果园',
    categoryId: 'cat_fruit_banana',
    cover: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=800',
    images: ['https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=800'],
    minPrice: 1990,
    maxPrice: 1990,
    sales: 268,
    totalStock: 300,
    status: 'ON_SALE',
    tags: ['软糯', '包邮'],
    sort: 90,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'prod_orange_gan',
    name: '赣南脐橙',
    title: '赣南脐橙',
    brand: '赣南果园',
    categoryId: 'cat_fruit_citrus',
    cover: 'https://images.unsplash.com/photo-1547514701-42782101795e?w=800',
    images: ['https://images.unsplash.com/photo-1547514701-42782101795e?w=800'],
    minPrice: 4990,
    maxPrice: 4990,
    sales: 210,
    totalStock: 180,
    status: 'ON_SALE',
    tags: ['爆款', '多汁'],
    sort: 80,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'prod_blueberry',
    name: '云南高山蓝莓',
    title: '云南高山蓝莓',
    brand: '高山果园',
    categoryId: 'cat_fruit_berry',
    cover: 'https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=800',
    images: ['https://images.unsplash.com/photo-1490474418585-ba9bad8fd0ea?w=800'],
    minPrice: 2990,
    maxPrice: 2990,
    sales: 156,
    totalStock: 150,
    status: 'ON_SALE',
    tags: ['新鲜', '抗氧化'],
    sort: 70,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'prod_cherry_chile',
    name: '智利车厘子 JJ级',
    title: '智利车厘子 JJ级',
    brand: '进口优选',
    categoryId: 'cat_import_cherry',
    cover: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?w=800',
    images: ['https://images.unsplash.com/photo-1528825871115-3581a5387919?w=800'],
    minPrice: 8990,
    maxPrice: 8990,
    sales: 98,
    totalStock: 80,
    status: 'ON_SALE',
    tags: ['进口', '大果'],
    sort: 100,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'prod_avocado',
    name: '墨西哥牛油果',
    title: '墨西哥牛油果',
    brand: '进口优选',
    categoryId: 'cat_import_avocado',
    cover: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=800',
    images: ['https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=800'],
    minPrice: 3990,
    maxPrice: 3990,
    sales: 120,
    totalStock: 160,
    status: 'ON_SALE',
    tags: ['进口', '即食'],
    sort: 90,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'prod_nuts_daily',
    name: '每日坚果 30 包',
    title: '每日坚果 30 包',
    brand: '坚果工坊',
    categoryId: 'cat_nuts_mix',
    cover: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=800',
    images: ['https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=800'],
    minPrice: 6990,
    maxPrice: 6990,
    sales: 180,
    totalStock: 100,
    status: 'ON_SALE',
    tags: ['健康', '即食'],
    sort: 90,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    _id: 'prod_dried_mango',
    name: '芒果干 500g',
    title: '芒果干 500g',
    brand: '果干工坊',
    categoryId: 'cat_nuts_dried',
    cover: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=800',
    images: ['https://images.unsplash.com/photo-1553279768-865429fa0078?w=800'],
    minPrice: 1990,
    maxPrice: 1990,
    sales: 240,
    totalStock: 250,
    status: 'ON_SALE',
    tags: ['零食', '酸甜'],
    sort: 80,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

const DEMO_SKUS = [
  { _id: 'sku_apple_5', productId: 'prod_apple_fuji', skuCode: 'FRUIT-APPLE-5', colorName: '5斤装', size: 5, price: 3990, stock: 200, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_apple_10', productId: 'prod_apple_fuji', skuCode: 'FRUIT-APPLE-10', colorName: '10斤装', size: 10, price: 5990, stock: 120, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_banana_3', productId: 'prod_banana_hi', skuCode: 'FRUIT-BANANA-3', colorName: '3斤装', size: 3, price: 1990, stock: 300, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_orange_5', productId: 'prod_orange_gan', skuCode: 'FRUIT-ORANGE-5', colorName: '5斤装', size: 5, price: 4990, stock: 180, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_blueberry_2', productId: 'prod_blueberry', skuCode: 'FRUIT-BLUEBERRY-2', colorName: '2盒装', size: 2, price: 2990, stock: 150, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_cherry_jj', productId: 'prod_cherry_chile', skuCode: 'FRUIT-CHERRY-JJ', colorName: 'JJ级 2斤', size: 2, price: 8990, stock: 80, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_avocado_4', productId: 'prod_avocado', skuCode: 'FRUIT-AVOCADO-4', colorName: '4个装', size: 4, price: 3990, stock: 160, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_nuts_30', productId: 'prod_nuts_daily', skuCode: 'FRUIT-NUTS-30', colorName: '30包/箱', size: 30, price: 6990, stock: 100, lockedStock: 0, status: 'ACTIVE' },
  { _id: 'sku_mango_500', productId: 'prod_dried_mango', skuCode: 'FRUIT-MANGO-500', colorName: '500g/袋', size: 500, price: 1990, stock: 250, lockedStock: 0, status: 'ACTIVE' }
];

// 演示卡密（兑换码）：UNUSED 未使用 / USED 已使用 / DISABLED 已禁用
const DEMO_ACTIVATION_CODES = [
  { _id: 'ac_demo_001', code: 'FRUIT-2026-0001', status: 'UNUSED', type: 'COUPON', benefit: '满100减10优惠券', value: 1000, redeemedBy: '', redeemedAt: null, createdAt: new Date(), updatedAt: new Date() },
  { _id: 'ac_demo_002', code: 'FRUIT-2026-0002', status: 'UNUSED', type: 'POINTS', benefit: '积分 +500', value: 500, redeemedBy: '', redeemedAt: null, createdAt: new Date(), updatedAt: new Date() }
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
  try { report.seeds.push(await seedIfEmpty('activation_codes', DEMO_ACTIVATION_CODES)); } catch (e) { report.seeds.push({ name: 'activation_codes', status: 'error: ' + (e.errMsg || e.message) }); }
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
