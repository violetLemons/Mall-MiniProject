/**
 * 示例演示数据填充脚本 (Seed Demo Data)
 * 本脚本仅包含虚拟示例数据，供首次部署体验商品展示、分类导航与履约演示。
 * 绝对不包含任何真实商业数据或用户隐私。
 */

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
    merchantId: null // 归平台，商家商品应填对应 merchantId
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
    merchantId: null // 归平台，商家商品应填对应 merchantId
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

const DEMO_PICKUP_POINTS = [
  {
    _id: 'pt_sz_001',
    id: 'pt_sz_001',
    name: '示例大学校园自提站',
    address: '示例省示例市示例区示例路1号示例大学商业街',
    hours: '09:00 - 21:30',
    phone: '13800000000',
    status: 'ACTIVE'
  }
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

console.log('Demo Seed Data Ready. To import into CloudBase, use the cloud database dashboard.');

module.exports = {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  DEMO_SKUS,
  DEMO_PICKUP_POINTS,
  DEMO_BANNERS
};
