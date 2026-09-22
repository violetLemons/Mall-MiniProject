/**
 * 生成演示订单数据 (Seed Orders)
 * 通过 `tcb db nosql execute` 的 MongoDB 原生 insert 命令，向云端写入：
 *   - orders          父支付单（隐形的合并支付载体）
 *   - merchant_orders 商家子订单（买家/商家看到的订单）
 *   - refund_records  退款记录
 *
 * 数据完全对齐 orders.create / confirmPayment / adminOrders 的真实字段结构，
 * 时间戳用 ISO-8601 字符串（与云端 JSON 序列化后的表现一致）。
 * 所有父支付单标记 isTest=true，发货/退款不会触发真实微信上报。
 *
 * 用法：node scripts/seed-orders.js [--apply]
 *   （默认 DRY-RUN 仅打印；加 --apply 真实写入）
 */

const { spawnSync } = require('child_process');

const ENV_ID = process.env.TCB_ENV_ID || 'cloud1-d3gffg6ok96e6cf3f';
const DEMO_USER = 'oUpF8u_demo_user_openid';

// 平台在售测试商品（真实存在）
const PLATFORM_PRODUCT_ID = '47b6fb71ae188e044707b8a5649d6c6e';
const PLATFORM_SKU_ID = 'cac02afa6e7b1b87609f2d8a4c11d1d4';
const PLATFORM_NAME = '验证测试板鞋';
const PLATFORM_IMAGE = 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800';
const PLATFORM_PRICE = 9900; // ¥99.00

// 商家 m1 的商品快照（自包含，用于演示商家隔离；m1 商品本身可另行创建）
const M1_PRODUCT_ID = 'm1_prod_001';
const M1_SKU_ID = 'm1_sku_001';
const M1_NAME = 'M1 潮流缓震跑鞋';
const M1_IMAGE = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800';
const M1_PRICE = 15900; // ¥159.00

const ADDR = {
  name: '张三',
  phone: '13800000000',
  province: '福建省',
  city: '厦门市',
  district: '思明区',
  detail: '示例大学1号楼 501 室'
};

function snapshot({ productId, skuId, productName, image, unitPrice, count, merchantId }) {
  return {
    productId,
    skuId,
    productName,
    colorName: '默认',
    size: 1,
    image,
    basePrice: unitPrice,
    platformFee: 0,
    unitPrice,
    count,
    totalAmount: unitPrice * count,
    merchantId: merchantId || null
  };
}

// 场景定义：每个场景 = 1 个父支付单 + 若干子订单
function buildScenarios() {
  const t = (s) => new Date(s).toISOString();
  const scenarios = [];

  // 1) 待付款（平台，1 件）
  scenarios.push({
    order: {
      _id: 'seed_order_001', orderNo: 'SL202609220001', merchantIds: [], status: 'PENDING_PAYMENT',
      createdAt: t('2026-09-23T08:00:00Z')
    },
    subs: [{
      _id: 'seed_mo_001', subOrderNo: 'MO202609220001', merchantId: null, status: 'PENDING_PAYMENT',
      createdAt: t('2026-09-23T08:00:00Z'),
      items: [snapshot({ productId: PLATFORM_PRODUCT_ID, skuId: PLATFORM_SKU_ID, productName: PLATFORM_NAME, image: PLATFORM_IMAGE, unitPrice: PLATFORM_PRICE, count: 1, merchantId: null })]
    }]
  });

  // 2) 已付款待发货（平台，2 件）
  scenarios.push({
    order: {
      _id: 'seed_order_002', orderNo: 'SL202609220002', merchantIds: [], status: 'PAID',
      paidAt: t('2026-09-23T08:05:00Z'), createdAt: t('2026-09-23T08:02:00Z')
    },
    subs: [{
      _id: 'seed_mo_002', subOrderNo: 'MO202609220002', merchantId: null, status: 'PAID',
      paidAt: t('2026-09-23T08:05:00Z'), createdAt: t('2026-09-23T08:02:00Z'),
      items: [snapshot({ productId: PLATFORM_PRODUCT_ID, skuId: PLATFORM_SKU_ID, productName: PLATFORM_NAME, image: PLATFORM_IMAGE, unitPrice: PLATFORM_PRICE, count: 2, merchantId: null })]
    }]
  });

  // 3) 已付款，跨商家拆单（平台 1 件 + m1 1 件 → 2 个子订单）
  scenarios.push({
    order: {
      _id: 'seed_order_003', orderNo: 'SL202609220003', merchantIds: ['m1'], status: 'PAID',
      paidAt: t('2026-09-23T09:10:00Z'), createdAt: t('2026-09-23T09:05:00Z')
    },
    subs: [
      {
        _id: 'seed_mo_003', subOrderNo: 'MO202609220003', merchantId: null, status: 'PAID',
        paidAt: t('2026-09-23T09:10:00Z'), createdAt: t('2026-09-23T09:05:00Z'),
        items: [snapshot({ productId: PLATFORM_PRODUCT_ID, skuId: PLATFORM_SKU_ID, productName: PLATFORM_NAME, image: PLATFORM_IMAGE, unitPrice: PLATFORM_PRICE, count: 1, merchantId: null })]
      },
      {
        _id: 'seed_mo_004', subOrderNo: 'MO202609220004', merchantId: 'm1', status: 'PAID',
        paidAt: t('2026-09-23T09:10:00Z'), createdAt: t('2026-09-23T09:05:00Z'),
        items: [snapshot({ productId: M1_PRODUCT_ID, skuId: M1_SKU_ID, productName: M1_NAME, image: M1_IMAGE, unitPrice: M1_PRICE, count: 1, merchantId: 'm1' })]
      }
    ]
  });

  // 4) 已发货（m1，1 件，多包裹演示：2 个运单号）
  scenarios.push({
    order: {
      _id: 'seed_order_004', orderNo: 'SL202609220004', merchantIds: ['m1'], status: 'SHIPPED',
      paidAt: t('2026-09-22T14:00:00Z'), createdAt: t('2026-09-22T13:50:00Z')
    },
    subs: [{
      _id: 'seed_mo_005', subOrderNo: 'MO202609220005', merchantId: 'm1', status: 'SHIPPED',
      paidAt: t('2026-09-22T14:00:00Z'), shippedAt: t('2026-09-22T15:30:00Z'), createdAt: t('2026-09-22T13:50:00Z'),
      shipments: [
        { trackingNo: 'SF1234567890', logisticsCompany: '顺丰速运', expressCompany: 'SF', shippedAt: t('2026-09-22T15:30:00Z') },
        { trackingNo: 'SF1234567891', logisticsCompany: '顺丰速运', expressCompany: 'SF', shippedAt: t('2026-09-22T15:35:00Z') }
      ],
      items: [snapshot({ productId: M1_PRODUCT_ID, skuId: M1_SKU_ID, productName: M1_NAME, image: M1_IMAGE, unitPrice: M1_PRICE, count: 1, merchantId: 'm1' })]
    }]
  });

  // 5) 已完成（平台，1 件）
  scenarios.push({
    order: {
      _id: 'seed_order_005', orderNo: 'SL202609220005', merchantIds: [], status: 'COMPLETED',
      paidAt: t('2026-09-21T10:00:00Z'), createdAt: t('2026-09-21T09:50:00Z')
    },
    subs: [{
      _id: 'seed_mo_006', subOrderNo: 'MO202609220006', merchantId: null, status: 'COMPLETED',
      paidAt: t('2026-09-21T10:00:00Z'), shippedAt: t('2026-09-21T16:00:00Z'), completedAt: t('2026-09-23T08:00:00Z'), createdAt: t('2026-09-21T09:50:00Z'),
      shipments: [
        { trackingNo: 'YT9876543210', logisticsCompany: '圆通速递', expressCompany: 'YTO', shippedAt: t('2026-09-21T16:00:00Z') }
      ],
      items: [snapshot({ productId: PLATFORM_PRODUCT_ID, skuId: PLATFORM_SKU_ID, productName: PLATFORM_NAME, image: PLATFORM_IMAGE, unitPrice: PLATFORM_PRICE, count: 1, merchantId: null })]
    }]
  });

  // 6) 退款审核中（m1，1 件，带退款记录）
  scenarios.push({
    order: {
      _id: 'seed_order_006', orderNo: 'SL202609220006', merchantIds: ['m1'], status: 'PAID',
      paidAt: t('2026-09-22T11:00:00Z'), createdAt: t('2026-09-22T10:50:00Z')
    },
    subs: [{
      _id: 'seed_mo_007', subOrderNo: 'MO202609220007', merchantId: 'm1', status: 'REFUND_PENDING',
      refundNo: 'seed_rf_001',
      paidAt: t('2026-09-22T11:00:00Z'), createdAt: t('2026-09-22T10:50:00Z'),
      items: [snapshot({ productId: M1_PRODUCT_ID, skuId: M1_SKU_ID, productName: M1_NAME, image: M1_IMAGE, unitPrice: M1_PRICE, count: 1, merchantId: 'm1' })]
    }],
    refund: {
      _id: 'seed_rf_001', orderId: 'seed_mo_007', parentOrderId: 'seed_order_006', merchantId: 'm1',
      outRefundNo: 'seed_rf_001', totalFee: M1_PRICE, refundFee: M1_PRICE, status: 'PENDING',
      reason: '尺码不合适，申请退货退款', userId: DEMO_USER, createdAt: t('2026-09-23T07:30:00Z')
    }
  });

  return scenarios;
}

// 把场景展开为三个集合的文档数组
function buildDocuments(scenarios) {
  const orders = [];
  const merchantOrders = [];
  const refunds = [];

  for (const sc of scenarios) {
    // 父支付单 items = 所有子订单 items 的并集
    const allItems = sc.subs.flatMap(s => s.items);

    orders.push({
      _id: sc.order._id,
      userId: DEMO_USER,
      userOpenid: DEMO_USER,
      orderNo: sc.order.orderNo,
      outTradeNo: sc.order.orderNo,
      items: allItems,
      merchantIds: sc.order.merchantIds,
      refundedAmount: 0,
      totalAmount: allItems.reduce((sum, it) => sum + it.totalAmount, 0),
      payAmount: allItems.reduce((sum, it) => sum + it.totalAmount, 0),
      deliveryType: 'DELIVERY',
      addressId: '',
      shippingAddress: ADDR,
      receiverSnapshot: ADDR,
      shippingStatus: sc.order.status === 'SHIPPED' || sc.order.status === 'COMPLETED' ? 'SHIPPED' : 'PENDING',
      logisticsCompany: '',
      logisticsCode: '',
      expressCompany: '',
      deliveryCompanyCode: '',
      trackingNo: '',
      shippedAt: null,
      shippingTime: null,
      pickupInfo: null,
      pickupPointId: '',
      pickupPointName: '',
      pickupPointAddress: '',
      pickupStatus: '',
      verificationCode: '',
      pickupCode: '',
      pickedUpAt: null,
      completeTime: null,
      completedAt: sc.order.status === 'COMPLETED' ? sc.subs[0].completedAt || null : null,
      remark: '',
      status: sc.order.status,
      orderStatus: sc.order.status,
      paymentStatus: sc.order.status === 'PENDING_PAYMENT' ? 'UNPAID' : 'PAID',
      transactionId: '',
      paymentTradeNo: '',
      paidAt: sc.order.paidAt || null,
      payTime: sc.order.paidAt || null,
      paymentInitiated: sc.order.status !== 'PENDING_PAYMENT',
      isTest: true,
      createdAt: sc.order.createdAt,
      createTime: sc.order.createdAt,
      updatedAt: sc.order.createdAt,
      updateTime: sc.order.createdAt,
      expireAt: new Date(new Date(sc.order.createdAt).getTime() + 30 * 60000).toISOString()
    });

    for (const sub of sc.subs) {
      merchantOrders.push({
        _id: sub._id,
        merchantId: sub.merchantId || null,
        parentOrderId: sc.order._id,
        parentOrderNo: sc.order.orderNo,
        subOrderNo: sub.subOrderNo,
        userId: DEMO_USER,
        items: sub.items,
        totalAmount: sub.items.reduce((sum, it) => sum + it.totalAmount, 0),
        deliveryType: 'DELIVERY',
        shippingAddress: ADDR,
        status: sub.status,
        shipments: sub.shipments || [],
        paidAt: sub.paidAt || null,
        shippedAt: sub.shippedAt || null,
        completedAt: sub.completedAt || null,
        refundNo: sub.refundNo || '',
        createdAt: sub.createdAt,
        updatedAt: sub.createdAt
      });
    }

    if (sc.refund) refunds.push(sc.refund);
  }

  return { orders, merchantOrders, refunds };
}

const CHUNK_SIZE = 2; // 单条命令最多插入文档数，避免超长命令被 bash 截断

function runInsert(collection, documents) {
  const cmd = [{
    TableName: collection,
    CommandType: 'COMMAND',
    Command: JSON.stringify({ insert: collection, documents })
  }];
  const shell = `tcb db nosql execute -e ${ENV_ID} --command '${JSON.stringify(cmd)}'`;
  const r = spawnSync('bash', ['-c', shell], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function run() {
  const isApply = process.argv.includes('--apply');
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
  const scenarios = buildScenarios();
  const { orders, merchantOrders, refunds } = buildDocuments(scenarios);

  const allBatches = [
    ['orders', orders],
    ['merchant_orders', merchantOrders],
    ['refund_records', refunds]
  ].filter(([collection]) => !only || collection === only);

  console.log(`目标环境: ${ENV_ID}`);
  console.log(`模式: ${isApply ? 'APPLY（真实写入）' : 'DRY-RUN（仅打印命令）'}`);
  if (only) console.log(`范围: 仅 ${only}`);
  console.log(`将写入: ${allBatches.map(([c, d]) => `${c} ${d.length} 条`).join(' / ')}\n`);

  let fail = 0;
  for (const [collection, documents] of allBatches) {
    if (documents.length === 0) continue;
    const chunks = chunk(documents, CHUNK_SIZE);
    if (!isApply) {
      for (const part of chunks) {
        const cmd = [{
          TableName: collection,
          CommandType: 'COMMAND',
          Command: JSON.stringify({ insert: collection, documents: part })
        }];
        console.log(`[DRY-RUN] ${collection} (${part.length} 条)`);
        console.log(`  tcb db nosql execute -e ${ENV_ID} --command '${JSON.stringify(cmd)}'\n`);
      }
      continue;
    }
    for (const part of chunks) {
      const { ok, out } = runInsert(collection, part);
      if (ok) {
        console.log(`[OK] ${collection} (${part.length} 条) 已写入`);
      } else {
        fail++;
        console.log(`[FAIL] ${collection} (${part.length} 条)`);
        console.log(out.trim().split('\n').slice(-8).join('\n'));
        console.log('');
      }
    }
  }

  if (isApply) {
    console.log(fail === 0 ? '全部订单数据已就绪。' : `有 ${fail} 个批次失败，见上方错误。`);
  } else {
    console.log('提示: 加 --apply 真正写入。');
  }
  if (fail > 0) process.exitCode = 1;
}

if (require.main === module) run();

module.exports = { buildScenarios, buildDocuments };
