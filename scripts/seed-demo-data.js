/**
 * 示例演示数据填充脚本 (Seed Demo Data)
 * 本脚本仅包含虚拟示例数据，供首次部署体验商品展示、分类导航与履约演示。
 * 绝对不包含任何真实商业数据或用户隐私。
 */

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
    maxPrice: 3990,
    sales: 320,
    status: 'ON_SALE',
    tags: ['新鲜', '脆甜'],
    sort: 100,
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
    status: 'ON_SALE',
    tags: ['软糯', '包邮'],
    sort: 90,
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
    status: 'ON_SALE',
    tags: ['爆款', '多汁'],
    sort: 80,
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
    status: 'ON_SALE',
    tags: ['新鲜', '抗氧化'],
    sort: 70,
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
    status: 'ON_SALE',
    tags: ['进口', '大果'],
    sort: 100,
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
    status: 'ON_SALE',
    tags: ['进口', '即食'],
    sort: 90,
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
    status: 'ON_SALE',
    tags: ['健康', '即食'],
    sort: 90,
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
    status: 'ON_SALE',
    tags: ['零食', '酸甜'],
    sort: 80,
  }
];

const DEMO_SKUS = [
  { _id: 'sku_apple_5', productId: 'prod_apple_fuji', skuCode: 'FRUIT-APPLE-5', colorName: '5斤装', size: 5, price: 3990, status: 'ACTIVE' },
  { _id: 'sku_banana_3', productId: 'prod_banana_hi', skuCode: 'FRUIT-BANANA-3', colorName: '3斤装', size: 3, price: 1990, status: 'ACTIVE' },
  { _id: 'sku_orange_5', productId: 'prod_orange_gan', skuCode: 'FRUIT-ORANGE-5', colorName: '5斤装', size: 5, price: 4990, status: 'ACTIVE' },
  { _id: 'sku_blueberry_2', productId: 'prod_blueberry', skuCode: 'FRUIT-BLUEBERRY-2', colorName: '2盒装', size: 2, price: 2990, status: 'ACTIVE' },
  { _id: 'sku_cherry_jj', productId: 'prod_cherry_chile', skuCode: 'FRUIT-CHERRY-JJ', colorName: 'JJ级 2斤', size: 2, price: 8990, status: 'ACTIVE' },
  { _id: 'sku_avocado_4', productId: 'prod_avocado', skuCode: 'FRUIT-AVOCADO-4', colorName: '4个装', size: 4, price: 3990, status: 'ACTIVE' },
  { _id: 'sku_nuts_30', productId: 'prod_nuts_daily', skuCode: 'FRUIT-NUTS-30', colorName: '30包/箱', size: 30, price: 6990, status: 'ACTIVE' },
  { _id: 'sku_mango_500', productId: 'prod_dried_mango', skuCode: 'FRUIT-MANGO-500', colorName: '500g/袋', size: 500, price: 1990, status: 'ACTIVE' }
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

// Production candidates stay offline until merchant details and content checks pass.
for (const product of DEMO_PRODUCTS) { product.sales=0; product.status='OFF_SALE'; }

console.log('Demo Seed Data Ready. To import into CloudBase, use the cloud database dashboard.');

module.exports = {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  DEMO_SKUS,
  DEMO_ACTIVATION_CODES,
  DEMO_BANNERS
};
