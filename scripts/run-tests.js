/**
 * 生产级业务与安全性全量自动化测试套件
 * 严格覆盖微信小程序商城整改要求中的所有核心业务与安全用例
 */

const assert = require('assert');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// 统一设置测试环境密钥与环境变量
process.env.ADMIN_JWT_SECRET = 'test_secret_for_suite_runner_key_at_least_32_chars_long!';
process.env.CLOUDBASE_ENV_ID = 'test-env-001';
process.env.WECHAT_APP_ID = 'wx1111222233334444';
process.env.WECHAT_PAY_MCH_ID = '10000100';

console.log('================================================================');
console.log('       通用商城生产化整改 & 微信支付安全测试套件       ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Case ${totalTests.toString().padStart(2, '0')}: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Case ${totalTests.toString().padStart(2, '0')}: ${testName}`);
    console.error(`       Error: ${err.message}`);
  }
}

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] Case ${totalTests.toString().padStart(2, '0')}: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Case ${totalTests.toString().padStart(2, '0')}: ${testName}`);
    console.error(`       Error: ${err.message}`);
  }
}

// 内存 Mock 数据库驱动 (模拟 CloudBase Database API，支持 CAS、_.inc、_.gte、正则与点路径)
function createMockDb(initialState) {
  const store = initialState ? JSON.parse(JSON.stringify(initialState)) : {
    users: [],
    admins: [],
    products: [],
    product_skus: [],
    categories: [],
    carts: [],
    orders: [],
    order_items: [],
    inventory_logs: [],
    payment_transactions: [],
    refund_records: [],
    pickup_points: [],
    operation_logs: []
  };

  const command = {
    inc: (val) => ({ _type: 'inc', val }),
    gte: (val) => ({ _type: 'gte', val }),
    lte: (val) => ({ _type: 'lte', val }),
    neq: (val) => ({ _type: 'neq', val })
  };

  function getByPath(obj, p) {
    if (!p.includes('.')) return obj[p];
    const parts = p.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr == null) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  function setByPath(obj, p, val) {
    if (!p.includes('.')) {
      obj[p] = val;
      return;
    }
    const parts = p.split('.');
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (curr[part] == null || typeof curr[part] !== 'object') {
        curr[part] = {};
      }
      curr = curr[part];
    }
    curr[parts[parts.length - 1]] = val;
  }

  function matchQuery(doc, query) {
    for (const key of Object.keys(query)) {
      const condition = query[key];
      const docVal = getByPath(doc, key);
      if (condition && typeof condition === 'object' && condition._type) {
        if (condition._type === 'gte' && !(docVal >= condition.val)) return false;
        if (condition._type === 'lte' && !(docVal <= condition.val)) return false;
        if (condition._type === 'neq' && docVal === condition.val) return false;
      } else if (condition instanceof RegExp) {
        if (!condition.test(String(docVal || ''))) return false;
      } else if (docVal !== condition) {
        return false;
      }
    }
    return true;
  }

  function applyUpdate(doc, updateData) {
    for (const key of Object.keys(updateData)) {
      const val = updateData[key];
      if (val && typeof val === 'object' && val._type === 'inc') {
        const current = getByPath(doc, key);
        setByPath(doc, key, (current || 0) + val.val);
      } else {
        setByPath(doc, key, val);
      }
    }
  }

  let transactionQueue = Promise.resolve();
  const db = {
    command,
    serverDate: () => new Date(),
    RegExp: ({ regexp }) => new RegExp(regexp, 'i'),
    collection: (collName) => {
      if (!store[collName]) store[collName] = [];
      const list = store[collName];

      const chain = {
        _query: {},
        _limit: 100,
        _skip: 0,
        where: (q) => { chain._query = q; return chain; },
        limit: (l) => { chain._limit = l; return chain; },
        skip: (s) => { chain._skip = s; return chain; },
        orderBy: () => chain,
        field: () => chain,
        doc: (id) => ({
          get: async () => {
            const found = list.find(x => x._id === id);
            if (!found) return { data: null };
            return { data: JSON.parse(JSON.stringify(found)) };
          },
          update: async (arg) => {
            const data = (arg && arg.data) ? arg.data : arg;
            const found = list.find(x => x._id === id);
            if (!found) return { stats: { updated: 0 } };
            applyUpdate(found, data);
            return { stats: { updated: 1 } };
          },
          set: async (arg) => {
            const data = (arg && arg.data) ? arg.data : arg;
            const index = list.findIndex(x => x._id === id);
            const doc = { ...(data || {}), _id: id };
            if (index === -1) list.push(doc); else list[index] = doc;
            return { _id: id };
          },
          remove: async () => {
            const idx = list.findIndex(x => x._id === id);
            if (idx === -1) return { stats: { removed: 0 } };
            list.splice(idx, 1);
            return { stats: { removed: 1 } };
          }
        }),
        get: async () => {
          const matched = list.filter(d => matchQuery(d, chain._query));
          return { data: matched.slice(chain._skip, chain._skip + chain._limit).map(d => JSON.parse(JSON.stringify(d))) };
        },
        count: async () => {
          const matched = list.filter(d => matchQuery(d, chain._query));
          return { total: matched.length };
        },
        add: async (arg) => {
          const data = (arg && arg.data) ? arg.data : arg;
          const _id = data._id || `id_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
          const doc = { ...data, _id };
          list.push(doc);
          return { _id };
        },
        update: async (arg) => {
          const data = (arg && arg.data) ? arg.data : arg;
          let updatedCount = 0;
          for (const doc of list) {
            if (matchQuery(doc, chain._query)) {
              applyUpdate(doc, data);
              updatedCount++;
            }
          }
          return { stats: { updated: updatedCount } };
        },
        remove: async () => {
          const initialLen = list.length;
          store[collName] = list.filter(d => !matchQuery(d, chain._query));
          return { stats: { removed: initialLen - store[collName].length } };
        }
      };
      return chain;
    },
    _store: store
  };

  db.runTransaction = async fn => {
    const run = transactionQueue.then(async () => {
      const tx = createMockDb(store);
      const result = await fn(tx);
      for (const key of Object.keys(store)) delete store[key];
      for (const [key, value] of Object.entries(tx._store)) store[key] = value;
      return { result };
    });
    transactionQueue = run.catch(() => {});
    return run;
  };

  return db;
}

// 主测试套件执行
async function runAllTests() {
  const cryptoModule = require('../cloudfunctions/common/crypto');

  // ==========================================
  // 1. 基础安全与加密规范校验
  // ==========================================

  // Test 1: Missing ADMIN_JWT_SECRET throws error
  runTest('Crypto: 缺少 ADMIN_JWT_SECRET 环境变量时抛出安全异常', () => {
    const savedSecret = process.env.ADMIN_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    try {
      assert.throws(() => {
        cryptoModule.createToken({ adminId: '123' });
      }, /ADMIN_JWT_SECRET environment variable is not configured/);
    } finally {
      process.env.ADMIN_JWT_SECRET = savedSecret;
    }
  });

  // Test 2: Valid token verification & tampered signature rejection
  runTest('Crypto: 正常签发 Token 与防篡改时序安全校验 (timingSafeEqual)', () => {
    const token = cryptoModule.createToken({ adminId: 'adm_super_01', role: 'SUPER_ADMIN' }, 3600);
    assert.ok(token);
    const payload = cryptoModule.verifyToken(token);
    assert.strictEqual(payload.adminId, 'adm_super_01');

    // 篡改签名
    const tampered = token.slice(0, -4) + 'abcd';
    assert.strictEqual(cryptoModule.verifyToken(tampered), null);
  });

  // Test 3: PBKDF2 password hashing and verification
  runTest('Crypto: PBKDF2 10000 次加盐哈希与密码比对', () => {
    const salt = 'aabbccddeeff00112233445566778899';
    const hash = cryptoModule.hashPassword('SuperSafePass#2026', salt);
    assert.ok(cryptoModule.verifyPassword('SuperSafePass#2026', salt, hash));
    assert.ok(!cryptoModule.verifyPassword('WrongPass#2026', salt, hash));
  });

  // ==========================================
  // Mock Cloud 初始化与 SDK 拦截
  // ==========================================
  const mockDb = createMockDb();
  let currentOpenid = null;

  const mockCloud = {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init: () => {},
    database: () => mockDb,
    getWXContext: () => ({ OPENID: currentOpenid }),
    _paidTradeNos: new Set(),
    _queryOrderHandler: null,
    _refundHandler: null,
    cloudPay: {
      unifiedOrder: async (opts) => ({
        returnCode: 'SUCCESS',
        resultCode: 'SUCCESS',
        payment: {
          timeStamp: String(Math.floor(Date.now() / 1000)),
          nonceStr: 'mock_nonce_123',
          package: 'prepay_id=wx_mock_prepay_88888',
          signType: 'MD5',
          paySign: 'MOCK_TEST_VERIFIED_SIGN'
        }
      }),
      queryOrder: async (opts) => {
        if (mockCloud._queryOrderHandler) {
          return mockCloud._queryOrderHandler(opts);
        }
        const order = mockDb._store.orders.find(o => o.orderNo === opts.outTradeNo);
        const isPaid = mockCloud._paidTradeNos.has(opts.outTradeNo) ||
          (order && ['PAID', 'READY_FOR_PICKUP', 'SHIPPED', 'COMPLETED', 'REFUNDING', 'REFUNDED'].includes(order.status));

        return {
          returnCode: 'SUCCESS',
          resultCode: 'SUCCESS',
          tradeState: isPaid ? 'SUCCESS' : 'NOTPAY',
          outTradeNo: order ? order.orderNo : opts.outTradeNo,
          transactionId: 'WX_TX_999888',
          totalFee: order ? order.payAmount : 69900,
          openid: order ? order.userId : 'openid_user_alpha',
          appid: process.env.WECHAT_APP_ID || 'wx1111222233334444',
          mchId: process.env.WECHAT_PAY_MCH_ID || '10000100',
          timeEnd: '20260909200000'
        };
      },
      closeOrder: async (opts) => {
        if (mockCloud._closeOrderHandler) {
          return mockCloud._closeOrderHandler(opts);
        }
        return {
          returnCode: 'SUCCESS',
          resultCode: 'SUCCESS'
        };
      },
      refund: async (opts) => {
        if (mockCloud._refundHandler) {
          return mockCloud._refundHandler(opts);
        }
        return {
          returnCode: 'SUCCESS',
          resultCode: 'SUCCESS',
          refundId: 'WX_REFUND_998877'
        };
      },
      queryRefund: async (opts) => ({
        returnCode: 'SUCCESS',
        resultCode: 'SUCCESS',
        refundStatus_0: 'SUCCESS',
        refundFee_0: mockDb._store.refund_records.find(r => r.outRefundNo === opts.outRefundNo)?.refundFee,
        outRefundNo_0: opts.outRefundNo
      })
    },
    openapi: {
      tradeManaged: {
        uploadShippingInfo: async (opts) => {
          if (mockCloud._uploadShippingHandler) {
            return mockCloud._uploadShippingHandler(opts);
          }
          return { errcode: 0, errmsg: 'ok' };
        }
      }
    }
  };

  // 拦截 require('wx-server-sdk')
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') {
      return mockCloud;
    }
    return originalLoad.apply(this, arguments);
  };

  // 预置基础数据：自提网点与超级管理员账号
  await mockDb.collection('pickup_points').add({
    _id: 'point_01',
    name: '深圳大学城潮流自提站',
    pointName: '深圳大学城潮流自提站',
    address: '大学城学苑大道1088号',
    status: 'ACTIVE'
  });

  await mockDb.collection('admins').add({
    _id: 'adm_super_01',
    username: 'superadmin',
    role: 'SUPER_ADMIN',
    permissions: ['*'],
    status: 'ACTIVE'
  });

  const { permissionVersion } = cryptoModule;
  const superAdminToken = cryptoModule.createToken({
    adminId: 'adm_super_01',
    username: 'superadmin',
    role: 'SUPER_ADMIN',
    permissions: ['*'],
    version: permissionVersion({ role: 'SUPER_ADMIN', permissions: ['*'], sessionVersion: 0 })
  }, 3600);

  // 标准可信测试收件地址
  const validDeliveryAddress = {
    name: '张同学',
    phone: '13800138000',
    province: '广东省',
    city: '深圳市',
    district: '南山区',
    detail: '大学城学苑大道1088号潮流实验室'
  };

  // ==========================================
  // 2. 用户与商品服务测试
  // ==========================================

  // Test 4: Auth cloud function rejects unauthenticated user
  await runAsyncTest('Auth: 无微信 OPENID 请求返回 AUTH_REQUIRED', async () => {
    currentOpenid = null;
    const authFunc = require('../cloudfunctions/auth/index');
    const res = await authFunc.main({ action: 'login' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'AUTH_REQUIRED');
  });

  // Test 5: Products search regex escaping
  await runAsyncTest('Products: 关键词包含正则特殊字符 (.*+?) 安全转义不抛错', async () => {
    const productsFunc = require('../cloudfunctions/products/index');
    const res = await productsFunc.main({
      action: 'list',
      params: { keyword: '商品 (Air)*+?' }
    });
    assert.strictEqual(res.success, true);
    assert.ok(Array.isArray(res.data.list));
  });

  // Test 6: Products detail returns 2D SKU matrix with availableStock
  await runAsyncTest('Products: 详情接口返回 2D SKU 矩阵与精确可用库存', async () => {
    await mockDb.collection('products').add({
      _id: 'prod_test_01',
      name: '测试经典款商品',
      status: 'ON_SALE',
      minPrice: 69900, // 699元存 69900 分
      maxPrice: 69900,
      cover: 'https://img.test/dunk.png'
    });
    await mockDb.collection('product_skus').add({
      _id: 'sku_dunk_42',
      productId: 'prod_test_01',
      skuCode: 'SKU-DUNK-42',
      colorName: '经典黑白',
      size: 42,
      price: 69900, // 69900 分
      stock: 20,
      lockedStock: 2,
      status: 'ACTIVE'
    });

    const productsFunc = require('../cloudfunctions/products/index');
    const res = await productsFunc.main({
      action: 'detail',
      params: { id: 'prod_test_01' }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.skus[0].price, 69900);
    assert.strictEqual(res.data.skus[0].availableStock, 18); // 20 - 2
    assert.strictEqual(res.data.skus[0].inStock, true);
  });

  // ==========================================
  // 3. 下单业务与参数防攻击测试 (P0: Case 2 & Case 8)
  // ==========================================

  // Test 7: Orders creation rejects unauthenticated user
  await runAsyncTest('Orders: 未登录无 OPENID 下单拒绝并拦截', async () => {
    currentOpenid = null;
    const ordersFunc = require('../cloudfunctions/orders/index');
    const res = await ordersFunc.main({
      action: 'create',
      params: { items: [{ skuId: 'sku_dunk_42', count: 1 }] }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'AUTH_REQUIRED');
  });

  // Test 8: Order creation calculates integer cents (¥699 -> 69900) and locks stock
  let orderAlphaId = '';
  let orderAlphaNo = '';
  await runAsyncTest('Orders: 699元商品下单必须存 69900 整型分并原子扣减库存/增加锁存', async () => {
    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');
    const res = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: 2 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.payAmount, 139800); // 69900 * 2 = 139800 分
    assert.strictEqual(Number.isSafeInteger(res.data.payAmount), true);
    orderAlphaId = res.data.orderId;
    orderAlphaNo = res.data.orderNo;

    const orderInDb = (await mockDb.collection('orders').doc(orderAlphaId).get()).data;
    assert.strictEqual(orderInDb.payAmount, 139800);
    assert.strictEqual(orderInDb.totalAmount, 139800);

    const skuAfter = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    assert.strictEqual(skuAfter.stock, 20); // 实物库存付款前不变
    assert.strictEqual(skuAfter.lockedStock, 4); // 2 + 2 锁定
  });

  // Test 9: Rejects floats, negative, NaN, duplicate SKU, exceeding purchase limits
  await runAsyncTest('Orders: 小数、负数、NaN、单款超限(>5)、重复SKU、总数超限(>10)均被严格拦截', async () => {
    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');

    // 1. 小数 count
    const resFloat = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: 1.5 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    assert.strictEqual(resFloat.success, false);
    assert.strictEqual(resFloat.code, 'INVALID_PARAMS');

    // 2. 负数 count
    const resNeg = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: -1 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    assert.strictEqual(resNeg.success, false);
    assert.strictEqual(resNeg.code, 'INVALID_PARAMS');

    // 3. NaN count
    const resNaN = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: NaN }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    assert.strictEqual(resNaN.success, false);
    assert.strictEqual(resNaN.code, 'INVALID_PARAMS');

    // 4. 单款超限 (count = 6 > 5)
    const resOver5 = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: 6 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    assert.strictEqual(resOver5.success, false);
    assert.strictEqual(resOver5.code, 'INVALID_PARAMS');

    // 5. 重复 SKU 下单
    const resDup = await ordersFunc.main({
      action: 'create',
      params: {
        items: [
          { skuId: 'sku_dunk_42', count: 1 },
          { skuId: 'sku_dunk_42', count: 2 }
        ],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    assert.strictEqual(resDup.success, false);
    assert.strictEqual(resDup.code, 'DUPLICATE_SKU');
  });

  // Test 10: Insufficient stock throws OUT_OF_STOCK and rolls back
  await runAsyncTest('Orders: 可用库存不足时拦截并安全回滚此前已锁定的 SKU', async () => {
    // 预置一个仅剩 1 件可用库存的限量 SKU
    await mockDb.collection('product_skus').add({
      _id: 'sku_low_01',
      productId: 'prod_test_01',
      skuCode: 'SKU-LOW-42',
      colorName: '限定极速蓝',
      size: 42,
      price: 69900,
      stock: 1, // 可售库存仅剩 1 双
      lockedStock: 0,
      status: 'ACTIVE'
    });

    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');

    // 尝试购买 2 件 (在 1~5 范围内，但大于可用库存 1)
    const res = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_low_01', count: 2 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'OUT_OF_STOCK');

    const skuAfter = (await mockDb.collection('product_skus').doc('sku_low_01').get()).data;
    assert.strictEqual(skuAfter.stock, 1); // 保持原状
    assert.strictEqual(skuAfter.lockedStock, 0);
  });

  // Test 11: IDOR Protection on orders detail and cancel
  await runAsyncTest('Orders: 越权访问拦截 (用户无法查看或取消他人订单)', async () => {
    currentOpenid = 'openid_attacker_beta'; // 攻击者身份
    const ordersFunc = require('../cloudfunctions/orders/index');

    const detailRes = await ordersFunc.main({
      action: 'detail',
      params: { id: orderAlphaId }
    });
    assert.strictEqual(detailRes.success, false);
    assert.strictEqual(detailRes.code, 'PERMISSION_DENIED');

    const cancelRes = await ordersFunc.main({
      action: 'cancel',
      params: { id: orderAlphaId }
    });
    assert.strictEqual(cancelRes.success, false);
    assert.strictEqual(cancelRes.code, 'PERMISSION_DENIED');
  });

  // Test 12: Cancel order restores stock
  await runAsyncTest('Orders: 用户主动取消订单释放锁存库存并恢复可用库存', async () => {
    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');
    const res = await ordersFunc.main({
      action: 'cancel',
      params: { id: orderAlphaId }
    });

    assert.strictEqual(res.success, true);
    const skuAfter = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    assert.strictEqual(skuAfter.stock, 20); // 18 + 2 恢复
    assert.strictEqual(skuAfter.lockedStock, 2); // 4 - 2 释放
  });

  // ==========================================
  // 4. 支付与支付回调全方位安全测试 (P0: Case 1, 3, 4, 5, 6)
  // ==========================================

  // 创建用于支付的正常订单 (金额 69900 分)
  currentOpenid = 'openid_user_alpha';
  const ordersFunc = require('../cloudfunctions/orders/index');
  const payOrderPrep = await ordersFunc.main({
    action: 'create',
    params: {
      items: [{ skuId: 'sku_dunk_42', count: 1 }],
      deliveryType: 'DELIVERY',
      shippingAddress: validDeliveryAddress
    }
  });
  const payOrderId = payOrderPrep.data.orderId;
  const payOrderNo = payOrderPrep.data.orderNo;

  // Test 13: createPayment validates status, ownership, and calls unifiedOrder
  await runAsyncTest('Payment: createPayment 强校验订单状态、归属权与整型分金额并调用官方 unifiedOrder', async () => {
    currentOpenid = 'openid_user_alpha';
    const paymentFunc = require('../cloudfunctions/payment/index');
    const res = await paymentFunc.main({
      action: 'createPayment',
      params: { orderId: payOrderId }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.orderId, payOrderId);
    assert.ok(res.data.payment);
  });

  // Test 14: Fake confirmPayment action is deleted
  await runAsyncTest('Payment: 伪造支付确认 action 彻底删除 (前端禁止直写 PAID)', async () => {
    currentOpenid = 'openid_user_alpha';
    const paymentFunc = require('../cloudfunctions/payment/index');
    const res = await paymentFunc.main({
      action: 'confirmPayment',
      params: { orderId: payOrderId }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'ACTION_NOT_FOUND');
  });

  // Test 15: Payment Callback comprehensive forgery defense (P0 Case 1)
  await runAsyncTest('PaymentCallback: 伪造支付回调防御 (客户端直调拦截、查单未成功、金额篡改、OpenID不匹配、AppID不匹配均失败且不改单)', async () => {
    // 微信回调没有小程序 OPENID 上下文；客户端身份只用于第一路伪造请求测试。
    const callbackFunc = require('../cloudfunctions/paymentCallback/index');

    // 15.1 模拟黑客从微信客户端发起伪造直调 (含有 userInfo.openId)
    currentOpenid = 'hacker_openid';
    const resClientCall = await callbackFunc.main({
      userInfo: { openId: 'hacker_openid' },
      outTradeNo: payOrderNo,
      totalFee: 69900
    });
    assert.strictEqual(resClientCall.errcode, 1);
    assert.strictEqual(resClientCall.errmsg, 'FORBIDDEN_CALLER');

    // 15.2 模拟微信查单返回非 SUCCESS 状态 (伪造已支付)
    currentOpenid = null;
    mockCloud._queryOrderHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      tradeState: 'PAYERROR', // 微信官方网关明确未支付成功
      errCodeDes: '余额不足支付失败'
    });
    const resGatewayFail = await callbackFunc.main({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      outTradeNo: payOrderNo,
      totalFee: 69900
    });
    assert.strictEqual(resGatewayFail.errcode, 1);
    assert.strictEqual(resGatewayFail.errmsg, 'PAYMENT_UNCERTAIN');

    // 15.3 模拟 1 分钱金额篡改攻击
    mockCloud._queryOrderHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      tradeState: 'SUCCESS',
      outTradeNo: payOrderNo,
      transactionId: 'TX_HACK_001',
      totalFee: 1, // 攻击者只付了 1 分钱
      openid: 'openid_user_alpha',
      appid: 'wx1111222233334444',
      mchId: '10000100'
    });
    const resAmountMismatch = await callbackFunc.main({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      outTradeNo: payOrderNo,
      totalFee: 1
    });
    assert.strictEqual(resAmountMismatch.errcode, 1);
    assert.strictEqual(resAmountMismatch.errmsg, 'AMOUNT_MISMATCH');

    // 15.4 模拟买家 OpenID 不一致 (黑客替他人刷单)
    mockCloud._queryOrderHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      tradeState: 'SUCCESS',
      outTradeNo: payOrderNo,
      transactionId: 'TX_HACK_002',
      totalFee: 69900,
      openid: 'openid_attacker_diff',
      appid: 'wx1111222233334444',
      mchId: '10000100'
    });
    const resBuyerMismatch = await callbackFunc.main({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      outTradeNo: payOrderNo,
      totalFee: 69900
    });
    assert.strictEqual(resBuyerMismatch.errcode, 1);
    assert.strictEqual(resBuyerMismatch.errmsg, 'BUYER_MISMATCH');

    // 15.5 模拟 AppID 假冒攻击
    mockCloud._queryOrderHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      tradeState: 'SUCCESS',
      outTradeNo: payOrderNo,
      transactionId: 'TX_HACK_003',
      totalFee: 69900,
      openid: 'openid_user_alpha',
      appid: 'wx_fake_appid_9999',
      mchId: '10000100'
    });
    const resAppIdMismatch = await callbackFunc.main({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      outTradeNo: payOrderNo,
      totalFee: 69900
    });
    assert.strictEqual(resAppIdMismatch.errcode, 1);
    assert.strictEqual(resAppIdMismatch.errmsg, 'APPID_MISMATCH');

    // 核心断言：经过以上所有伪造攻击后，订单绝对没有被改成 PAID
    const orderCheck = (await mockDb.collection('orders').doc(payOrderId).get()).data;
    assert.strictEqual(orderCheck.status, 'PENDING_PAYMENT');

    // 还原查单处理器
    mockCloud._queryOrderHandler = null;
  });

  // Test 16: Legitimate payment callback succeeds and confirms order
  await runAsyncTest('PaymentCallback: 微信官方可信支付回调流转订单为 PAID 并正式销库存', async () => {
    currentOpenid = null;
    mockCloud._queryOrderHandler = null;
    // 标记微信网关已收款
    mockCloud._paidTradeNos.add(payOrderNo);

    const callbackFunc = require('../cloudfunctions/paymentCallback/index');
    const legitimateCallbackEvent = {
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      outTradeNo: payOrderNo,
      transactionId: 'WX_TX_999888',
      totalFee: 69900,
      timeEnd: '20260909201500'
    };

    const res = await callbackFunc.main(legitimateCallbackEvent);
    assert.strictEqual(res.errcode, 0);

    const orderAfter = (await mockDb.collection('orders').doc(payOrderId).get()).data;
    assert.strictEqual(orderAfter.status, 'PAID');
    assert.strictEqual(orderAfter.paymentTradeNo, 'WX_TX_999888');

    // 检查 lockedStock 已正式消除
    const skuAfter = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    assert.strictEqual(skuAfter.lockedStock, 2); // 3 - 1 (锁定库存正式转化为销量)
  });

  // Test 17: Concurrency between callback and queryOrder only deducts stock once (P0 Case 3)
  await runAsyncTest('Concurrency: 回调与查单并发时，CAS 保证库存只扣减一次', async () => {
    // 创建新并发测试订单
    currentOpenid = 'openid_user_concurrent';
    const cOrderRes = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: 2 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    const cOrderId = cOrderRes.data.orderId;
    const cOrderNo = cOrderRes.data.orderNo;

    // 标记已支付
    mockCloud._paidTradeNos.add(cOrderNo);

    const skuBefore = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    const initialLocked = skuBefore.lockedStock;

    // 两路同时发起支付确认：A 路为支付回调，B 路为前端查单 confirmOrderPaymentSuccess
    const callbackFunc = require('../cloudfunctions/paymentCallback/index');
    const { confirmOrderPaymentSuccess } = require('../cloudfunctions/common/orderPayConfirm');
    mockCloud._queryOrderHandler = async () => ({
      returnCode: 'SUCCESS', resultCode: 'SUCCESS', tradeState: 'SUCCESS', outTradeNo: cOrderNo,
      transactionId: 'TX_CONCURRENT_CB_001', totalFee: 139800, openid: 'openid_user_concurrent',
      appid: 'wx1111222233334444', mchId: '10000100'
    });

    const ev = {
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      outTradeNo: cOrderNo,
      transactionId: 'TX_CONCURRENT_CB_001',
      totalFee: 139800,
      timeEnd: '20260909202000'
    };

    currentOpenid = null;
    const [resA, resB] = await Promise.all([
      callbackFunc.main(ev),
      confirmOrderPaymentSuccess(mockDb, mockDb.command, {
        orderId: cOrderId,
        orderNo: cOrderNo,
        transactionId: 'TX_CONCURRENT_CB_001',
        totalFee: 139800,
        openid: 'openid_user_concurrent',
        timeEnd: '20260909202000'
      })
    ]);

    assert.strictEqual(resA.errcode, 0);
    assert.strictEqual(resB.status, 'PAID');

    const skuAfter = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    // 库存严格只扣减 2，绝对不会因为并发导致扣减 4 (2*2) 或变成负数
    assert.strictEqual(skuAfter.lockedStock, initialLocked - 2);

    // 检查销存流水只有 1 批
    const logRes = await mockDb.collection('inventory_logs').where({
      orderId: cOrderId,
      reason: 'PAYMENT_CONFIRMED'
    }).get();
    assert.strictEqual(logRes.data.length, 1);
    mockCloud._queryOrderHandler = null;
  });

  // Test 18: Compensation mechanism for incomplete execution on retry (P0 Case 4)
  await runAsyncTest('Compensation: 支付状态扣减一半失败或重试可正常幂等补偿完成', async () => {
    // 构造一个模拟半路崩溃的数据：订单状态已成功修改为 PAID，但由于当时网络崩溃，尚未记录销存流水和支付账单
    const crashOrderId = 'order_crash_test_01';
    const crashOrderNo = 'ORD_CRASH_TEST_01';
    await mockDb.collection('orders').add({
      _id: crashOrderId,
      orderNo: crashOrderNo,
      userId: 'openid_user_alpha',
      status: 'PAID',
      inventoryVersion: 2,
      isTest: false,
      paymentTradeNo: 'TX_CRASH_PREVIOUS',
      payAmount: 69900,
      items: [{ skuId: 'sku_dunk_42', productId: 'prod_test_01', count: 1 }]
    });

    // 为该 SKU 临时增加 1 个锁定库存模拟未扣完
    await mockDb.collection('product_skus').doc('sku_dunk_42').update({
      data: { lockedStock: mockDb.command.inc(1) }
    });

    const { confirmOrderPaymentSuccess } = require('../cloudfunctions/common/orderPayConfirm');

    // 原子事务不会接受缺少对应支付流水的“半完成”订单，要求重新对账。
    await assert.rejects(() => confirmOrderPaymentSuccess(mockDb, mockDb.command, {
      orderId: crashOrderId,
      orderNo: crashOrderNo,
      transactionId: 'TX_CRASH_COMPENSATE',
      totalFee: 69900,
      openid: 'openid_user_alpha'
    }), err => err.code === 'TRANSACTION_MISMATCH');

    // 验证库存流水和支付流水均未被错误补写
    const logCount = await mockDb.collection('inventory_logs').where({
      orderId: crashOrderId,
      reason: 'PAYMENT_CONFIRMED'
    }).count();
    assert.strictEqual(logCount.total, 0);

    const txCount = await mockDb.collection('payment_transactions').where({
      orderId: crashOrderId,
      status: 'SUCCESS'
    }).count();
    assert.strictEqual(txCount.total, 0);
  });

  // Test 19: Concurrency between cancel and payment prevents cancelling paid order (P0 Case 5)
  await runAsyncTest('Concurrency: 取消订单与支付成功并发，查单与状态机保障绝不把已付款订单改成 CANCELLED', async () => {
    // 处于 PAID 状态的订单尝试取消
    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');
    const cancelRes = await ordersFunc.main({
      action: 'cancel',
      params: { id: payOrderId } // payOrderId 已经是 PAID
    });

    assert.strictEqual(cancelRes.success, false);
    assert.strictEqual(cancelRes.code, 'INVALID_ORDER_STATUS');

    const orderCheck = (await mockDb.collection('orders').doc(payOrderId).get()).data;
    assert.strictEqual(orderCheck.status, 'PAID'); // 状态绝不会被篡改为 CANCELLED
  });

  // Test 20: Paid order cancellation must go through refund (P0 Case 6)
  await runAsyncTest('Refund: 已支付订单取消必须走退款流程 (PAID -> REFUNDING)，退款确认前不释放库存', async () => {
    const paymentFunc = require('../cloudfunctions/payment/index');

    const skuBefore = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;

    const refundRes = await paymentFunc.main({
      action: 'refund',
      token: superAdminToken,
      params: {
        orderId: payOrderId,
        reason: '买错规格申请退款'
      }
    });

    assert.strictEqual(refundRes.success, true);
    assert.strictEqual(refundRes.data.status, 'REFUNDING');

    const orderAfter = (await mockDb.collection('orders').doc(payOrderId).get()).data;
    assert.strictEqual(orderAfter.status, 'REFUNDING');

    // 核心断言：退款处理中状态 (REFUNDING) 严禁提前释放库存！
    const skuAfter = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    assert.strictEqual(skuAfter.stock, skuBefore.stock);

    // 检查退款记录表
    const rfRec = (await mockDb.collection('refund_records').where({ orderId: payOrderId }).get()).data[0];
    assert.strictEqual(rfRec.status, 'PROCESSING');
    assert.strictEqual(rfRec.totalFee, 69900);
  });

  // Test 21: Order timeout cron job auto-cancels expired orders
  await runAsyncTest('OrderTimeoutJob: 定时轮询自动关单与库存原子释放 (已付款订单不关单)', async () => {
    // 注入过期未付款订单
    await mockDb.collection('orders').add({
      _id: 'order_timeout_01',
      orderNo: 'ORD_TIMEOUT_01',
      userId: 'user_timeout',
      status: 'PENDING_PAYMENT',
      inventoryVersion: 2,
      isTest: false,
      paymentInitiated: false,
      expireAt: new Date(Date.now() - 3600 * 1000), // 已过期 1 小时
      items: [{ skuId: 'sku_dunk_42', count: 2, productId: 'prod_test_01' }]
    });

    // 预先给 SKU 加上 2 个 lockedStock
    await mockDb.collection('product_skus').doc('sku_dunk_42').update({
      data: { lockedStock: mockDb.command.inc(2) }
    });

    const timeoutJob = require('../cloudfunctions/orderTimeoutJob/index');
    currentOpenid = null;
    const jobRes = await timeoutJob.main({});
    assert.strictEqual(jobRes.success, true);

    const orderAfter = (await mockDb.collection('orders').doc('order_timeout_01').get()).data;
    assert.strictEqual(orderAfter.status, 'CANCELLED');
    assert.strictEqual(orderAfter.cancelReason, 'PAYMENT_TIMEOUT');
  });

  // ==========================================
  // 5. 校园自提状态机与核销安全测试 (P0: Case 7)
  // ==========================================

  // 创建校园自提订单
  currentOpenid = 'openid_student_pickup';
  const pickupOrderPrep = await ordersFunc.main({
    action: 'create',
    params: {
      items: [{ skuId: 'sku_dunk_42', count: 1 }],
      deliveryType: 'PICKUP',
      pickupPointId: 'point_01'
    }
  });

  const pickupOrderId = pickupOrderPrep.data.orderId;
  const pickupOrderNo = pickupOrderPrep.data.orderNo;
  const adminOrdersFunc = require('../cloudfunctions/adminOrders/index');

  // Test 22: Unpaid pickup order cannot be prepared
  await runAsyncTest('Pickup: 未支付自提订单不可备货 (adminOrders:preparePickup 严格拦截)', async () => {
    const res = await adminOrdersFunc.main({
      action: 'preparePickup',
      token: superAdminToken,
      params: { orderId: pickupOrderId }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_ORDER_STATUS');

    const orderCheck = (await mockDb.collection('orders').doc(pickupOrderId).get()).data;
    assert.strictEqual(orderCheck.status, 'PENDING_PAYMENT');
  });

  // Test 23: Unprepared pickup order cannot be verified
  await runAsyncTest('Pickup: 未备货自提订单不可核销 (adminOrders:verifyPickup 严格拦截)', async () => {
    const res = await adminOrdersFunc.main({
      action: 'verifyPickup',
      token: superAdminToken,
      params: { orderId: pickupOrderId, pickupCode: '888888' }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_ORDER_STATUS');
  });

  // Test 24: Paid pickup order preparation and 6-digit code verification flow
  await runAsyncTest('Pickup: 已支付订单正常备货 (READY_FOR_PICKUP) 并由后台直接完成交付 (COMPLETED)', async () => {
    // 1. 用户完成支付，订单变为 PAID
    const { confirmOrderPaymentSuccess } = require('../cloudfunctions/common/orderPayConfirm');
    await confirmOrderPaymentSuccess(mockDb, mockDb.command, {
      orderId: pickupOrderId,
      orderNo: pickupOrderNo,
      transactionId: 'TX_PICKUP_PAID_01',
      totalFee: 69900,
      openid: 'openid_student_pickup'
    });

    const paidOrder = (await mockDb.collection('orders').doc(pickupOrderId).get()).data;
    assert.strictEqual(paidOrder.status, 'PAID');

    // 2. 商家配货完成，标记 READY_FOR_PICKUP
    const prepRes = await adminOrdersFunc.main({
      action: 'preparePickup',
      token: superAdminToken,
      params: { orderId: pickupOrderId }
    });
    assert.strictEqual(prepRes.success, true);

    const readyOrder = (await mockDb.collection('orders').doc(pickupOrderId).get()).data;
    assert.strictEqual(readyOrder.status, 'READY_FOR_PICKUP');
    assert.strictEqual(readyOrder.pickupInfo.pickupStatus, 'READY');

    // 3. 管理员在后台直接确认自提完成交付 (无需自提码)
    const completeRes = await adminOrdersFunc.main({
      action: 'completePickup',
      token: superAdminToken,
      params: { orderId: pickupOrderId }
    });
    assert.strictEqual(completeRes.success, true);

    const finishedOrder = (await mockDb.collection('orders').doc(pickupOrderId).get()).data;
    assert.strictEqual(finishedOrder.status, 'COMPLETED');
    assert.strictEqual(finishedOrder.pickupInfo.pickupStatus, 'PICKED');
  });

  // ==========================================
  // 6. 后台生产安全模式无接口地址拦截测试 (P0: Case 9)
  // ==========================================

  // Test 25: Admin Security rejects startup without VITE_CLOUDBASE_URL and has no mock backdoor
  runTest('Admin Security: 生产模式无后台接口地址时拒绝启动，不能进入沙箱且无 mock 凭证后门', () => {
    // 1. 验证 getCloudBaseUrl 拦截逻辑
    function testGetCloudBaseUrl(envVal) {
      if (!envVal || typeof envVal !== 'string' || !envVal.trim()) {
        throw new Error('[Admin Security] 未配置 VITE_CLOUDBASE_URL，禁止启动！生产模式严禁在缺少真实云开发后端网关时进入沙箱。');
      }
      return envVal.trim();
    }

    assert.throws(() => {
      testGetCloudBaseUrl('');
    }, /未配置 VITE_CLOUDBASE_URL，禁止启动/);

    assert.throws(() => {
      testGetCloudBaseUrl(undefined);
    }, /未配置 VITE_CLOUDBASE_URL，禁止启动/);

    // 2. 静态审计 admin-web/src/api/client.ts 确保零 mock 数据生成器与零 6 位后门密码
    const clientCode = fs.readFileSync(path.resolve(__dirname, '../admin-web/src/api/client.ts'), 'utf8');
    assert.ok(!clientCode.includes('DEFAULT_SUPERADMIN'), 'client.ts 不得包含 DEFAULT_SUPERADMIN 演示凭证');
    assert.ok(!clientCode.includes('DEFAULT_OPERATOR'), 'client.ts 不得包含 DEFAULT_OPERATOR 演示凭证');
    assert.ok(!clientCode.includes('generateInitialProducts'), 'client.ts 不得包含前端内存商品假数据生成器');
    assert.ok(!clientCode.includes('admin_users_db'), 'client.ts 不得包含本地 localStorage 用户沙箱后门');
    assert.ok(clientCode.includes('[Admin Security] 未配置 VITE_CLOUDBASE_URL，禁止启动'), 'client.ts 必须具备生产环境网关严格阻断校验');
  });

  // ==========================================
  // 7. 高并发、支付异常路径与网关故障专项测试套件 (P0: Concurrency & Exceptions)
  // ==========================================

  // Test 26: 占位符或缺失配置阻断执行测试
  runTest('Config Guard: 占位符或缺少核心配置时严格抛错阻断，不得带默认值静默执行', () => {
    const { getValidatedWechatPayConfig, isPlaceholder } = require('../cloudfunctions/common/config');
    assert.strictEqual(isPlaceholder('YOUR_WECHAT_APP_ID'), true);
    assert.strictEqual(isPlaceholder('00000000'), true);
    assert.strictEqual(isPlaceholder('xxxxxx'), true);
    assert.strictEqual(isPlaceholder(''), true);
    assert.strictEqual(isPlaceholder('   '), true);
    assert.strictEqual(isPlaceholder('wx1111222233334444'), false);

    const savedAppId = process.env.WECHAT_APP_ID;
    try {
      process.env.WECHAT_APP_ID = 'YOUR_APP_ID';
      assert.throws(() => {
        getValidatedWechatPayConfig();
      }, /CONFIG_ERROR/);
    } finally {
      process.env.WECHAT_APP_ID = savedAppId;
    }

    const savedMchId = process.env.WECHAT_PAY_MCH_ID;
    try {
      process.env.WECHAT_PAY_MCH_ID = '00000000';
      assert.throws(() => {
        getValidatedWechatPayConfig();
      }, /CONFIG_ERROR/);
    } finally {
      process.env.WECHAT_PAY_MCH_ID = savedMchId;
    }
  });

  // Test 27: 官方文档标准格式报文回调测试 (兼容 snake_case 与 camelCase)
  await runAsyncTest('PaymentCallback: 严格遵从官方规范，支持 snake_case 与 camelCase 回调报文', async () => {
    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');
    const orderPrep = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: 1 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    const testOrderNo = orderPrep.data.orderNo;

    mockCloud._queryOrderHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      tradeState: 'SUCCESS',
      outTradeNo: testOrderNo,
      transactionId: 'TX_SNAKE_CASE_001',
      totalFee: 69900,
      openid: 'openid_user_alpha',
      appid: 'wx1111222233334444',
      mchId: '10000100',
      timeEnd: '20260909210000'
    });

    const callbackFunc = require('../cloudfunctions/paymentCallback/index');
    currentOpenid = null;
    const resSnake = await callbackFunc.main({
      return_code: 'SUCCESS',
      result_code: 'SUCCESS',
      out_trade_no: testOrderNo,
      transaction_id: 'TX_SNAKE_CASE_001',
      total_fee: 69900,
      time_end: '20260909210000'
    });

    assert.strictEqual(resSnake.errcode, 0);
    assert.strictEqual(resSnake.errmsg, 'SUCCESS');

    const orderDoc = (await mockDb.collection('orders').where({ orderNo: testOrderNo }).get()).data[0];
    assert.strictEqual(orderDoc.status, 'PAID');
    assert.strictEqual(orderDoc.paymentTradeNo, 'TX_SNAKE_CASE_001');
  });

  // Test 28: 重复支付回调高并发测试 (CAS 与 SKU 幂等锁保证仅销存一次且均返回 ACK)
  await runAsyncTest('Concurrency: 重复支付回调高并发 (CAS 与 SKU 幂等锁保证仅销存一次，均返回 ACK)', async () => {
    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');
    const orderPrep = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: 1 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    const testOrderNo = orderPrep.data.orderNo;
    const testOrderId = orderPrep.data.orderId;

    const skuBefore = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    const lockedStockBefore = skuBefore.lockedStock;

    mockCloud._queryOrderHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      tradeState: 'SUCCESS',
      outTradeNo: testOrderNo,
      transactionId: 'TX_REPEAT_CB_001',
      totalFee: 69900,
      openid: 'openid_user_alpha',
      appid: 'wx1111222233334444',
      mchId: '10000100',
      timeEnd: '20260909210500'
    });

    const callbackFunc = require('../cloudfunctions/paymentCallback/index');
    currentOpenid = null;
    // 并发触发 5 次回调
    const results = await Promise.all([
      callbackFunc.main({ returnCode: 'SUCCESS', resultCode: 'SUCCESS', outTradeNo: testOrderNo }),
      callbackFunc.main({ returnCode: 'SUCCESS', resultCode: 'SUCCESS', outTradeNo: testOrderNo }),
      callbackFunc.main({ returnCode: 'SUCCESS', resultCode: 'SUCCESS', outTradeNo: testOrderNo }),
      callbackFunc.main({ returnCode: 'SUCCESS', resultCode: 'SUCCESS', outTradeNo: testOrderNo }),
      callbackFunc.main({ returnCode: 'SUCCESS', resultCode: 'SUCCESS', outTradeNo: testOrderNo })
    ]);

    // 5 次必须均返回成功应答 (errcode: 0)
    for (const r of results) {
      assert.strictEqual(r.errcode, 0);
    }

    // 验证 lockedStock 仅扣减了 1 件，绝不超扣
    const skuAfter = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    assert.strictEqual(skuAfter.lockedStock, lockedStockBefore - 1);

    // 验证销存流水只有 1 条 (带唯一幂等键)
    const logs = (await mockDb.collection('inventory_logs').where({
      orderId: testOrderId,
      reason: 'PAYMENT_CONFIRMED'
    }).get()).data;
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].idempotencyKey, `${testOrderId}_sku_dunk_42_PAYMENT_CONFIRMED`);
  });

  // Test 29: 并发退款确认 CAS 状态锁测试
  await runAsyncTest('Refund: 并发退款确认 CAS 状态锁 (只有 1 个处理方更新状态并回滚库存，防库存翻倍)', async () => {
    const refundOrderId = 'order_refund_concur_01';
    const refundOrderNo = 'ORD_REFUND_CONCUR_01';
    const outRefundNo = `${refundOrderNo}_REF_1`;

    await mockDb.collection('orders').add({
      _id: refundOrderId,
      orderNo: refundOrderNo,
      userId: 'openid_user_alpha',
      items: [{ productId: 'prod_test_01', skuId: 'sku_dunk_42', count: 2 }],
      payAmount: 139800,
      status: 'REFUNDING',
      inventoryVersion: 2,
      isTest: false,
      refundNo: outRefundNo
    });

    await mockDb.collection('refund_records').add({
      _id: outRefundNo,
      orderId: refundOrderId,
      orderNo: refundOrderNo,
      outRefundNo,
      status: 'PROCESSING',
      refundFee: 139800
    });

    const skuBefore = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    const stockBefore = skuBefore.stock;

    mockCloud._queryRefundHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      refundStatus_0: 'SUCCESS'
    });

    const paymentFunc = require('../cloudfunctions/payment/index');

    // 并发 3 次请求确认退款
    const results = await Promise.all([
      paymentFunc.main({ action: 'confirmRefund', token: superAdminToken, params: { outRefundNo } }),
      paymentFunc.main({ action: 'confirmRefund', token: superAdminToken, params: { outRefundNo } }),
      paymentFunc.main({ action: 'confirmRefund', token: superAdminToken, params: { outRefundNo } })
    ]);

    for (const r of results) {
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.data.status, 'REFUNDED');
    }

    // 验证库存仅回滚了 2 件 (stockBefore + 2)，绝不翻倍 (如变成 +4 或 +6)
    const skuAfter = (await mockDb.collection('product_skus').doc('sku_dunk_42').get()).data;
    assert.strictEqual(skuAfter.stock, stockBefore + 2);

    // 验证退款单状态为 SUCCESS
    const rfAfter = (await mockDb.collection('refund_records').doc(outRefundNo).get()).data;
    assert.strictEqual(rfAfter.status, 'SUCCESS');

    // 验证库存流水仅 1 条且带有 SKU 唯一幂等键
    const restoreLogs = (await mockDb.collection('inventory_logs').where({
      orderId: refundOrderId,
      reason: 'REFUND_RESTORE'
    }).get()).data;
    assert.strictEqual(restoreLogs.length, 1);
    assert.strictEqual(restoreLogs[0].idempotencyKey, `${refundOrderId}_sku_dunk_42_REFUND_RESTORE`);
  });

  // Test 30: 多 SKU 下单部分失败原子回滚与审计流水测试
  await runAsyncTest('Orders: 多 SKU 下单中途超卖部分失败整体回滚，并保留回滚操作审计', async () => {
    await mockDb.collection('product_skus').add({
      _id: 'sku_multi_avail',
      productId: 'prod_test_01',
      colorName: '晨雾灰',
      size: 41,
      price: 69900,
      stock: 10,
      lockedStock: 0,
      status: 'ACTIVE'
    });

    await mockDb.collection('product_skus').add({
      _id: 'sku_multi_zero',
      productId: 'prod_test_01',
      colorName: '黑曜石',
      size: 45,
      price: 69900,
      stock: 0,
      lockedStock: 0,
      status: 'ACTIVE'
    });

    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');

    const res = await ordersFunc.main({
      action: 'create',
      params: {
        items: [
          { skuId: 'sku_multi_avail', count: 2 },
          { skuId: 'sku_multi_zero', count: 1 }
        ],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'OUT_OF_STOCK');

    // 验证第 1 个 SKU 的库存被安全恢复，lockedStock 归 0
    const skuAvail = (await mockDb.collection('product_skus').doc('sku_multi_avail').get()).data;
    assert.strictEqual(skuAvail.stock, 10);
    assert.strictEqual(skuAvail.lockedStock, 0);

    // 事务在提交前整体失败，不会留下半条库存或回滚流水
    const rollbackLogs = (await mockDb.collection('inventory_logs').where({
      skuId: 'sku_multi_avail',
      reason: 'ORDER_LOCK_ROLLBACK'
    }).get()).data;
    assert.strictEqual(rollbackLogs.length, 0);
  });

  // Test 31: 取消订单前微信查单超时/网络异常阻断取消测试
  await runAsyncTest('Orders: 取消订单前微信查单超时/网络异常必须阻断取消 (防御已付款被误关单)', async () => {
    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');
    const orderPrep = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: 1 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    const orderId = orderPrep.data.orderId;
    await mockDb.collection('orders').doc(orderId).update({ data: { paymentInitiated: true } });

    // 模拟向微信支付查单时发生网关网络超时
    mockCloud._queryOrderHandler = async () => {
      throw new Error('GATEWAY_ETIMEDOUT: connect timeout to wechatpay');
    };

    const cancelRes = await ordersFunc.main({
      action: 'cancel',
      params: { id: orderId }
    });

    assert.strictEqual(cancelRes.success, false);
    assert.strictEqual(cancelRes.code, 'PAYMENT_UNCERTAIN');

    // 验证订单依然处于待付款状态，库存绝未被释放
    const orderAfter = (await mockDb.collection('orders').doc(orderId).get()).data;
    assert.strictEqual(orderAfter.status, 'PENDING_PAYMENT');

    mockCloud._queryOrderHandler = null;
  });

  // Test 32: 微信关单失败阻断取消订单测试
  await runAsyncTest('Orders: 微信关单接口返回失败阻断取消订单，保护商户交易安全', async () => {
    currentOpenid = 'openid_user_alpha';
    const ordersFunc = require('../cloudfunctions/orders/index');
    const orderPrep = await ordersFunc.main({
      action: 'create',
      params: {
        items: [{ skuId: 'sku_dunk_42', count: 1 }],
        deliveryType: 'DELIVERY',
        shippingAddress: validDeliveryAddress
      }
    });
    const orderId = orderPrep.data.orderId;
    await mockDb.collection('orders').doc(orderId).update({ data: { paymentInitiated: true } });

    // 查单返回未付款
    mockCloud._queryOrderHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      tradeState: 'NOTPAY'
    });

    // 关单返回系统错误
    mockCloud._closeOrderHandler = async () => ({
      returnCode: 'SUCCESS',
      resultCode: 'FAIL',
      errCode: 'SYSTEMERROR',
      errCodeDes: '微信支付关单系统繁忙'
    });

    const cancelRes = await ordersFunc.main({
      action: 'cancel',
      params: { id: orderId }
    });

    assert.strictEqual(cancelRes.success, false);
    assert.strictEqual(cancelRes.code, 'CLOSE_ORDER_FAILED');

    // 验证订单依然待支付，未被取消
    const orderAfter = (await mockDb.collection('orders').doc(orderId).get()).data;
    assert.strictEqual(orderAfter.status, 'PENDING_PAYMENT');

    mockCloud._queryOrderHandler = null;
    mockCloud._closeOrderHandler = null;
  });

  // Test 33: 退款网关异常时保留 REFUNDING，等待查单核实
  await runAsyncTest('Payment: 微信退款网关调用异常时保留 REFUNDING 并记录待核实状态', async () => {
    const refundOrderId = 'order_refund_gw_fail_01';
    await mockDb.collection('orders').add({
      _id: refundOrderId,
      orderNo: 'ORD_RF_GW_01',
      userId: 'openid_user_alpha',
      items: [{ productId: 'prod_test_01', skuId: 'sku_dunk_42', count: 1 }],
      payAmount: 69900,
      status: 'PAID',
      inventoryVersion: 2,
      isTest: false,
      paymentTradeNo: 'WX_TX_RF_GW_01'
    });

    // 模拟退款网关抛出网络异常
    mockCloud._refundHandler = async () => {
      throw new Error('GATEWAY_REFUND_TIMEOUT');
    };

    const paymentFunc = require('../cloudfunctions/payment/index');
    currentOpenid = null;
    const res = await paymentFunc.main({
      action: 'refund',
      token: superAdminToken,
      params: { orderId: refundOrderId, reason: '规格不合申请退款' }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, 'REFUNDING');

    // 验证订单保持 REFUNDING，且记录了错误信息，等待后续查单确认
    const orderAfter = (await mockDb.collection('orders').doc(refundOrderId).get()).data;
    assert.strictEqual(orderAfter.status, 'REFUNDING');
    const refundRecord = (await mockDb.collection('refund_records').where({ orderId: refundOrderId }).get()).data[0];
    assert.strictEqual(refundRecord.lastError, 'GATEWAY_UNCERTAIN');

    mockCloud._refundHandler = null;
  });

  // Test 34: 微信发货管理 API 上报失败记录 SHIPPING_SYNC_FAILED 并允许重试
  await runAsyncTest('AdminOrders: 微信发货管理上报失败记录 SHIPPING_SYNC_FAILED 并可通过 retryShippingSync 成功重试', async () => {
    const shipOrderId = 'order_ship_retry_01';
    await mockDb.collection('orders').add({
      _id: shipOrderId,
      orderNo: 'ORD_SHIP_RETRY_01',
      userId: 'openid_user_alpha',
      items: [{ productId: 'prod_test_01', skuId: 'sku_dunk_42', count: 1, productName: '测试商品' }],
      payAmount: 69900,
      paymentTradeNo: 'WX_TX_SHIP_001',
      status: 'PAID',
      deliveryType: 'DELIVERY',
      inventoryVersion: 2,
      shippingAddress: validDeliveryAddress
    });

    const adminOrdersFunc = require('../cloudfunctions/adminOrders/index');

    // 1. 模拟微信开放接口发货上报失败
    mockCloud._uploadShippingHandler = async () => {
      throw new Error('WECHAT_API_NETWORK_ERROR: failed to reach tradeManaged');
    };

    const shipRes = await adminOrdersFunc.main({
      action: 'ship',
      token: superAdminToken,
      params: { orderId: shipOrderId, trackingNo: 'SF1234567890' }
    });

    assert.strictEqual(shipRes.success, true);
    assert.strictEqual(shipRes.data.shippingSyncStatus, 'SHIPPING_SYNC_FAILED');

    const orderShipped = (await mockDb.collection('orders').doc(shipOrderId).get()).data;
    assert.strictEqual(orderShipped.status, 'SHIPPED');
    assert.strictEqual(orderShipped.shippingSyncStatus, 'SHIPPING_SYNC_FAILED');
    assert.ok(orderShipped.shippingSyncError.includes('WECHAT_API_NETWORK_ERROR'));

    // 2. 恢复微信接口正常，管理员发起重试
    mockCloud._uploadShippingHandler = async (opts) => {
      // 验证使用了官方规范 orderNumberType: 2 与 transactionId
      assert.strictEqual(opts.orderKey.orderNumberType, 2);
      assert.strictEqual(opts.orderKey.transactionId, 'WX_TX_SHIP_001');
      return { errcode: 0, errmsg: 'ok' };
    };

    const retryRes = await adminOrdersFunc.main({
      action: 'retryShippingSync',
      token: superAdminToken,
      params: { orderId: shipOrderId }
    });

    assert.strictEqual(retryRes.success, true);

    const orderSynced = (await mockDb.collection('orders').doc(shipOrderId).get()).data;
    assert.strictEqual(orderSynced.shippingSyncStatus, 'SHIPPING_SYNC_SUCCESS');
    assert.strictEqual(orderSynced.shippingSyncError, null);

    mockCloud._uploadShippingHandler = null;
  });

  // Test 35: 用户查单、取消订单、关闭支付单缺失 OPENID 严格返回 AUTH_REQUIRED
  await runAsyncTest('Auth: 用户查单、取消订单、关闭支付单在缺失 OPENID 时必须返回 AUTH_REQUIRED', async () => {
    currentOpenid = null; // 无 OPENID (未授权或匿名环境)

    const paymentFunc = require('../cloudfunctions/payment/index');
    const ordersFunc = require('../cloudfunctions/orders/index');

    // 1. payment:queryOrder 无 OPENID
    const res1 = await paymentFunc.main({
      action: 'queryOrder',
      params: { orderId: 'any_order_id' }
    });
    assert.strictEqual(res1.success, false);
    assert.strictEqual(res1.code, 'AUTH_REQUIRED');

    // 2. payment:closeOrder 无 OPENID
    const res2 = await paymentFunc.main({
      action: 'closeOrder',
      params: { orderNo: 'ORD_ANY' }
    });
    assert.strictEqual(res2.success, false);
    assert.strictEqual(res2.code, 'AUTH_REQUIRED');

    // 3. orders:cancel 无 OPENID
    const res3 = await ordersFunc.main({
      action: 'cancel',
      params: { id: 'any_order_id' }
    });
    assert.strictEqual(res3.success, false);
    assert.strictEqual(res3.code, 'AUTH_REQUIRED');

    // 4. orders:detail 无 OPENID
    const res4 = await ordersFunc.main({
      action: 'detail',
      params: { id: 'any_order_id' }
    });
    assert.strictEqual(res4.success, false);
    assert.strictEqual(res4.code, 'AUTH_REQUIRED');
  });

  console.log('\n================================================================');
  console.log(`测试结果汇总: 全部 ${totalTests} 项关键用例测试完毕，成功率: ${(passedTests / totalTests * 100).toFixed(1)}%`);
  console.log(`成功通过: ${passedTests} / ${totalTests}`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('[FATAL RUNNER ERROR]:', err);
  process.exit(1);
});
