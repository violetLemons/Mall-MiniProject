/**
 * 接口契约自动化集成测试套件
 * 针对 scripts/local-admin-api.js 及云函数契约规范进行端到端全量检验
 */

const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:3001';
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '../work/local-test/credentials.json'), 'utf8'));
let authToken = '';

function request(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const hasBody = body !== undefined && body !== null;
    const data = hasBody ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request(url, {
      method: hasBody ? 'POST' : 'GET',
      headers: {
        ...(hasBody ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        } : {}),
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        'Connection': 'close',
        ...headers
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          const json = resBody ? JSON.parse(resBody) : {};
          resolve({ status: res.statusCode, data: json, raw: resBody });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resBody, error: e });
        }
      });
    });

    req.on('error', reject);
    if (hasBody) req.write(data);
    req.end();
  });
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('====================================================');
  console.log('       Admin API 网关契约全量自动化验证套件       ');
  console.log('====================================================\n');

  // 1. 健康检查
  await test('1. GET /health 状态与环境标识返回 LOCAL_SIMULATOR', async () => {
    const res = await request('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.env, 'LOCAL_SIMULATOR');
  });

  // 2. 未鉴权请求拦截
  await test('2. 未携带 Token 请求受保护资源返回 401 AUTH_REQUIRED', async () => {
    const res = await request('/api/adminProducts', { action: 'list', data: {} });
    if (res.status !== 401) {
      console.log('DEBUG TEST 2:', res);
    }
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.code, 'AUTH_REQUIRED');
  });

  // 3. 错误密码登录拦截
  await test('3. 错误密码登录被拒绝返回 401 AUTH_FAILED', async () => {
    const res = await request('/api/adminAuth', {
      action: 'login',
      data: { username: 'superadmin', password: 'wrongpassword' }
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.code, 'AUTH_FAILED');
  });

  // 4. 正确密码登录与 Token 签发
  await test('4. 正确账号密码登录成功并获取 Bearer Token', async () => {
    const res = await request('/api/adminAuth', {
      action: 'login',
      data: { username: credentials.username, password: credentials.password }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.token, 'Token 必须存在');
    assert.strictEqual(res.data.data.username, 'superadmin');
    authToken = res.data.data.token;
  });

  // 5. 类目中心契约
  await test('5. adminCategories:list 返回标准类目列表', async () => {
    const res = await request('/api/adminCategories', { action: 'list', data: {} });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.data), '类目必须为数组');
    assert(res.data.data.some(c => c.id === 'c1' && c.name === '数码'), '必须包含 c1 数码');
  });

  let createdCatId = '';
  await test('6. adminCategories:create 创建新类目并返回 categoryId (并在测试完成后清理)', async () => {
    const res = await request('/api/adminCategories', {
      action: 'create',
      data: { name: '临时测试分类', icon: 'zap', sort: 99 }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.categoryId, '必须返回 categoryId');
    createdCatId = res.data.data.categoryId;

    // 即刻删除临时测试类目，确保不污染前端业务分类
    const delRes = await request('/api/adminCategories', {
      action: 'delete',
      data: { id: createdCatId }
    });
    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delRes.data.success, true);
  });

  // 7. 商品库与整型分金额契约
  await test('7. adminProducts:list 返回商品且金额严格为整数分', async () => {
    const res = await request('/api/adminProducts', { action: 'list', data: { page: 1, pageSize: 10 } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.data.list), '商品列表必须为数组');
    const first = res.data.data.list[0];
    assert(Number.isInteger(first.minPrice), 'minPrice 必须为整型分');
    assert(Number.isInteger(first.maxPrice), 'maxPrice 必须为整型分');
    assert(first.minPrice >= 100, '价格分至少为 100 分');
  });

  let newProductId = '';
  let testSkuId = '';
  await test('8. adminProducts:create 创建新商品，校验字段并返回 productId', async () => {
    const res = await request('/api/adminProducts', {
      action: 'create',
      data: {
        name: '测试无线蓝牙耳机',
        brand: '声动',
        categoryId: 'c1',
        category: '数码',
        cover: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800',
        minPrice: 69900,
        maxPrice: 69900,
        totalStock: 100,
        tags: ['新品', '热卖']
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.productId, '必须返回 productId');
    newProductId = res.data.data.productId;
  });

  // 9. SKU 矩阵独立更新接口 updateSkus
  await test('9. adminProducts:updateSkus 更新 SKU 规格矩阵', async () => {
    const newSkus = [
      { skuId: `sku_ts_${Date.now()}_40`, colorName: '经典黑', size: 40, price: 69900, stock: 15, status: 'ACTIVE' },
      { skuId: `sku_ts_${Date.now()}_41`, colorName: '经典黑', size: 41, price: 69900, stock: 25, status: 'ACTIVE' },
      { skuId: `sku_ts_${Date.now()}_42`, colorName: '经典黑', size: 42, price: 74900, stock: 30, status: 'ACTIVE' },
      { skuId: `sku_ts_${Date.now()}_43`, colorName: '经典黑', size: 43, price: 79900, stock: 20, status: 'ACTIVE' }
    ];
    testSkuId = newSkus[2].skuId;
    const res = await request('/api/adminProducts', {
      action: 'updateSkus',
      data: { id: newProductId, skus: newSkus }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.totalStock, 90);
    assert.strictEqual(res.data.data.minPrice, 69900);
    assert.strictEqual(res.data.data.maxPrice, 79900);
    assert.strictEqual(res.data.data.skuCount, 4);
  });

  // 10. 库存调账与变动流水
  await test('10. adminInventory:adjustStock 调账 SKU 库存并生成审计流水', async () => {
    const res = await request('/api/adminInventory', {
      action: 'adjustStock',
      data: {
        skuId: testSkuId,
        targetStock: 50,
        reason: '盘点盘盈入库'
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.logId, '必须生成 logId');
  });

  await test('11. adminInventory:listLogs 分页查询库存流水', async () => {
    const res = await request('/api/adminInventory', { action: 'listLogs', data: { page: 1, pageSize: 20 } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.data.list), '流水必须为数组');
    assert(res.data.data.total >= 1, '总数至少为 1');

    // 清理测试商品，保持业务商品库干净
    if (newProductId) {
      await request('/api/adminProducts', { action: 'purge', data: { id: newProductId } });
    }
  });

  // 12. 订单履约与核销
  await test('12. adminOrders:list 查询订单列表与买家地址', async () => {
    const res = await request('/api/adminOrders', { action: 'list', data: { page: 1, pageSize: 20 } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.data.list), '订单必须为列表');
    const ord = res.data.data.list[0];
    if (ord) {
      assert(ord.orderNo, '订单必须包含 orderNo');
      assert(Number.isInteger(ord.payAmount), '实付金额必须为整数分');
    }
  });

  await test('13. adminOrders:ship 顺丰发货更新运单号', async () => {
    const listRes = await request('/api/adminOrders', { action: 'list', data: { page: 1, pageSize: 20, status: 'PAID', deliveryType: 'DELIVERY' } });
    const order = listRes.data?.data?.list?.[0];
    if (!order) return;
    const res = await request('/api/adminOrders', {
      action: 'ship',
      data: { orderId: order._id || order.id, trackingNo: 'SF123456789012' }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // 14. 轮播营销与 HTTPS 校验
  await test('14. adminBanners:create 校验 https:// 协议并成功创建 (测试完成后清理)', async () => {
    const res = await request('/api/adminBanners', {
      action: 'create',
      data: {
        title: '秋季开学特别企划',
        imageUrl: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=1200',
        targetUrl: '/pages/goods/list?tag=校园特惠',
        badge: '开学专享',
        sort: 90
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.bannerId, '必须返回 bannerId');
    // 清理测试 Banner
    await request('/api/adminBanners', { action: 'delete', data: { id: res.data.data.bannerId } });
  });

  // 15. 管理员账号与密码安全
  await test('15. adminUsers:create 拦截短于 8 位的弱密码', async () => {
    const res = await request('/api/adminUsers', {
      action: 'create',
      data: {
        username: 'test_short_pw',
        name: '测试员',
        password: '123'
      }
    });
    assert.strictEqual(res.status, 400);
    assert(res.data.message.includes('8 位密码'));
  });

  await test('16. adminUsers:create 创建合格管理员账号', async () => {
    const res = await request('/api/adminUsers', {
      action: 'create',
      data: {
        username: `mgr_${Date.now()}`,
        name: '陈运营主管',
        role: 'OPERATOR',
        password: 'StrongPassword123!',
        permissions: ['products:*', 'orders:*']
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.data.adminId, '必须返回 adminId');
  });

  await test('17. adminUsers:operationLogs 查询审计日志', async () => {
    const res = await request('/api/adminUsers', { action: 'operationLogs', data: { page: 1, pageSize: 20 } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.data.list), '日志列表必须为数组');
  });

  // 18. 未知 Action 404 拦截
  await test('18. 未知 Action 请求返回 404 ACTION_NOT_FOUND', async () => {
    const res = await request('/api/adminProducts', { action: 'unknownDangerousAction', data: {} });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.code, 'ACTION_NOT_FOUND');
  });

  // 19. 超大 Payload 413 拦截
  await test('19. 超大 Payload (>2MB) 请求返回 413 PAYLOAD_TOO_LARGE', async () => {
    const hugeStr = 'X'.repeat(2.2 * 1024 * 1024);
    const res = await request('/api/adminProducts', { action: 'list', data: { dummy: hugeStr } });
    assert.strictEqual(res.status, 413);
    assert.strictEqual(res.data.code, 'PAYLOAD_TOO_LARGE');
  });

  console.log('\n====================================================');
  console.log(`测试完成: ${passed} 项通过, ${failed} 项失败`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('契约测试运行器严重错误:', err);
  process.exit(1);
});
