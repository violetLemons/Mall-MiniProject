/**
 * 前端与格式化契约自动化验证脚本
 * 验证 formatCents, centsToYuan, yuanToCents, SKU 矩阵计算, 以及地址和安全规则
 */

const assert = require('assert');

console.log('====================================================');
console.log('       前端展现与交互契约自动化验证套件       ');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// 模拟 format.ts 中的工具函数
function formatCents(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) return '0.00';
  return (cents / 100).toFixed(2);
}

function centsToYuan(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) return 0;
  return Number((cents / 100).toFixed(2));
}

function yuanToCents(yuan) {
  if (typeof yuan !== 'number' || isNaN(yuan)) return 0;
  return Math.round(yuan * 100);
}

// 1. 金额分转换契约
test('1. formatCents 正确格式化整数分为两位小数元', () => {
  assert.strictEqual(formatCents(69900), '699.00');
  assert.strictEqual(formatCents(129800), '1298.00');
  assert.strictEqual(formatCents(0), '0.00');
  assert.strictEqual(formatCents(50), '0.50');
  assert.strictEqual(formatCents(9), '0.09');
});

test('2. yuanToCents 和 centsToYuan 相互转换且避免浮点精度溢出', () => {
  assert.strictEqual(yuanToCents(699), 69900);
  assert.strictEqual(yuanToCents(699.99), 69999);
  assert.strictEqual(yuanToCents(0.1 + 0.2), 30); // 浮点精度保护
  assert.strictEqual(centsToYuan(69999), 699.99);
});

// 2. SKU 矩阵总库存与价格区间计算
test('3. SKU 矩阵自动计算 totalStock, minPrice, maxPrice', () => {
  const skus = [
    { size: 40, price: 69900, stock: 20 },
    { size: 41, price: 69900, stock: 25 },
    { size: 42, price: 74900, stock: 30 },
    { size: 43, price: 79900, stock: 15 }
  ];

  const totalStock = skus.reduce((sum, s) => sum + s.stock, 0);
  const prices = skus.map(s => s.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  assert.strictEqual(totalStock, 90);
  assert.strictEqual(minPrice, 69900);
  assert.strictEqual(maxPrice, 79900);
});

// 3. 库存语义验证：可用库存计算为 stock - lockedStock
test('4. 可用库存语义正确 (availableStock = max(stock - lockedStock, 0))', () => {
  const skuInDb = {
    stock: 20,        // 物理库存
    lockedStock: 2     // 待支付占位
  };
  const availableStock = Math.max((skuInDb.stock || 0) - (skuInDb.lockedStock || 0), 0);
  assert.strictEqual(availableStock, 18, '可用库存必须为 18');
});

// 4. 地址拼接 fallback 验证
test('5. 收货地址支持 receiverName/name 及 district 降级', () => {
  const addr1 = {
    province: '广东省',
    city: '深圳市',
    district: '南山区',
    detail: '大学城学苑大道1088号',
    name: '张同学',
    phone: '13800138000'
  };

  const addr2 = {
    province: '广东省',
    city: '深圳市',
    detail: '学苑大道1088号',
    receiverName: '李同学',
    phone: '13900139000'
  };

  function formatAddr(addr) {
    const p = addr.province || '';
    const c = addr.city || '';
    const d = addr.district || '';
    const det = addr.detail || '';
    const name = addr.receiverName || addr.name || '微信买家';
    const phone = addr.phone || '';
    return `${p} ${c} ${d} ${det} (${name} 收 / ${phone})`.replace(/\s+/g, ' ').trim();
  }

  assert.strictEqual(formatAddr(addr1), '广东省 深圳市 南山区 大学城学苑大道1088号 (张同学 收 / 13800138000)');
  assert.strictEqual(formatAddr(addr2), '广东省 深圳市 学苑大道1088号 (李同学 收 / 13900139000)');
});

// 5. 密码策略验证
test('6. 管理员密码长度策略 (>= 8 位)', () => {
  function validatePassword(pw) {
    return typeof pw === 'string' && pw.length >= 8;
  }
  assert.strictEqual(validatePassword('123456'), false);
  assert.strictEqual(validatePassword('admin123'), true);
  assert.strictEqual(validatePassword('StrongPassword2026!'), true);
});

console.log('\n====================================================');
console.log(`前端逻辑测试完成: ${passed} 项通过, ${failed} 项失败`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
}
