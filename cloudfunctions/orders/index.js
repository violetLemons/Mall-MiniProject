/**
 * 订单交易核心云函数 (orders)
 * 纯自包含生产级实现，严格服务端核价与库存事务锁定
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function key(...parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

function text(value, name, min = 1, max = 200) {
  const s = String(value || '').trim();
  if (s.length < min || s.length > max) throw err('INVALID_PARAMS', `${name}格式不正确`);
  return s;
}

function integer(value, name, min = 0, max = 100000000) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw err('INVALID_PARAMS', `${name}必须为 ${min}~${max} 的整数`);
  return n;
}

function success(data = null, message = '操作成功') {
  return {
    success: true,
    code: 'OK',
    message,
    data,
    requestId: (crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random())),
    serverTime: Date.now()
  };
}

function fail(code = 'SYSTEM_ERROR', message = '系统内部错误') {
  return {
    success: false,
    code: (typeof code === 'string' && /^[A-Z_]{3,50}$/.test(code)) ? code : 'SYSTEM_ERROR',
    message: message || '服务暂时不可用，请稍后重试',
    data: null,
    requestId: (crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random())),
    serverTime: Date.now()
  };
}

async function safeDocGet(targetDb, collection, docId) {
  try {
    const res = await targetDb.collection(collection).doc(docId).get();
    return Array.isArray(res.data) ? res.data[0] || null : res.data || null;
  } catch (e) {
    return null;
  }
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (_) {}
}

function normalizeAddress(raw) {
  if (!raw || typeof raw !== 'object') throw err('INVALID_ADDRESS', '请提供有效收货地址');
  const name = text(raw.name, '收货人姓名', 1, 30);
  const phone = text(raw.phone, '手机号码', 11, 11);
  if (!/^1[3-9]\d{9}$/.test(phone)) throw err('INVALID_PHONE', '请输入有效手机号');
  const province = text(raw.province, '省份', 1, 50);
  const city = text(raw.city, '城市', 1, 50);
  const district = String(raw.district || '').trim();
  const detail = text(raw.detail, '详细地址', 1, 300);
  return { name, phone, province, city, district, detail };
}

exports.main = async (event, context) => {
  const { action, params = {} } = event || {};
  try {
    const wxContext = cloud.getWXContext();
    const userId = wxContext.OPENID;
    if (!userId) throw err('AUTH_REQUIRED', '请先登录');

    // 1. 创建订单 (服务端严格核价与库存锁定)
    if (action === 'create') {
      const startTime = Date.now();
      console.log(`[ORDER-01] orders.create 启动, t=0ms`);

      const requestId = text(params.requestId || key(Date.now(), Math.random(), String(Math.random())), '下单请求标识', 10, 100);
      if (!Array.isArray(params.items) || !params.items.length || params.items.length > 20) {
        throw err('INVALID_PARAMS', '订单须包含 1~20 款商品规格');
      }

      const isPickup = params.deliveryType === 'PICKUP' || params.deliveryType === 'pickup' || params.deliveryType === 'store_pickup';
      const deliveryType = isPickup ? 'PICKUP' : 'DELIVERY';
      const seen = new Set();
      const inputs = params.items.map(i => {
        const skuId = text(i.skuId, '规格ID', 1, 100);
        if (seen.has(skuId)) throw err('DUPLICATE_SKU', '请合并重复规格');
        seen.add(skuId);
        return {
          skuId,
          count: integer(i.count, '购买数量', 1, 5),
          cartId: i.cartId ? String(i.cartId).trim() : ''
        };
      });

      const orderId = key(userId, requestId);

      // 支持事务或安全原子更新
      const executeCreate = async (tx) => {
        const existing = await safeDocGet(tx, 'orders', orderId);
        if (existing) {
          console.log(`[ORDER-02] 幂等命中已存在订单: ${existing.orderNo}, t=${Date.now() - startTime}ms`);
          return { orderId: existing._id, orderNo: existing.orderNo, payAmount: existing.payAmount };
        }

        let shippingAddress = null;
        let pickupInfo = null;

        if (deliveryType === 'DELIVERY') {
          let addr = params.shippingAddress || params.receiverSnapshot;
          if (params.addressId) {
            const found = await safeDocGet(tx, 'addresses', String(params.addressId).trim());
            if (found && found.userId === userId) {
              addr = found;
            }
          }
          if (!addr) throw err('INVALID_ADDRESS', '请选择收货地址');
          shippingAddress = normalizeAddress(addr);
        } else {
          const pointId = text(params.pickupPointId || (params.pickupInfo && params.pickupInfo.pointId), '自提点ID', 1, 100);
          const point = await safeDocGet(tx, 'pickup_points', pointId);
          if (!point || point.status !== 'ACTIVE') throw err('INVALID_PICKUP_POINT', '自提点不存在或暂停营业');
          pickupInfo = {
            pointId: point._id || point.id,
            pointName: point.name,
            address: point.address || '',
            pickupStatus: 'PREPARING'
          };
        }
        console.log(`[ORDER-03] 履约方式 (${deliveryType}) 与自提/地址解析完成, t=${Date.now() - startTime}ms`);

        // 服务端根据数据库真实售价重新计算金额并校验库存
        const snapshots = [];
        for (const input of inputs) {
          const sku = await safeDocGet(tx, 'product_skus', input.skuId);
          if (!sku || sku.status !== 'ACTIVE') throw err('SKU_NOT_FOUND', '规格不存在或已停售');
          const p = await safeDocGet(tx, 'products', sku.productId);
          if (!p || p.status !== 'ON_SALE' || p.deletedAt) throw err('PRODUCT_OFF_SALE', '商品已下架');

          const currentLocked = sku.lockedStock || 0;
          const availableStock = sku.stock - currentLocked;
          if (availableStock < input.count) throw err('OUT_OF_STOCK', `商品【${p.name}】规格库存不足`);

          const platformFee = integer(p.platformFee || 0, '平台抽成', 0);
          const unitPrice = integer(sku.price, '商品单价', 1) + platformFee;
          const totalAmount = unitPrice * input.count;
          snapshots.push({
            productId: sku.productId,
            skuId: sku._id,
            productName: p.name,
            colorName: sku.colorName || '',
            size: sku.size,
            image: sku.colorImage || p.cover || '',
            basePrice: integer(sku.price, '商品单价', 1),
            platformFee,
            unitPrice,
            count: input.count,
            totalAmount,
            merchantId: p.merchantId || null
          });

          // 校验同时直接更新锁库，避免第二轮冗余查询
          await tx.collection('product_skus').doc(input.skuId).update({
            data: {
              lockedStock: currentLocked + input.count,
              updatedAt: new Date()
            }
          });
        }
        console.log(`[ORDER-04] 商品与规格核验及锁库完成 (${snapshots.length} 项), t=${Date.now() - startTime}ms`);

        // 计算整数分
        const payAmount = integer(snapshots.reduce((sum, item) => sum + item.totalAmount, 0), '订单金额', 1);
        const orderNo = `SL${Date.now()}${orderId.slice(0, 8)}`;
        const merchantIds = [...new Set(snapshots.map(s => s.merchantId).filter(Boolean))];

        const now = new Date();
        const order = {
          _id: orderId,
          userId,
          userOpenid: userId,
          orderNo,
          outTradeNo: orderNo,
          items: snapshots,
          merchantIds,
          refundedAmount: 0,
          totalAmount: payAmount,
          payAmount,
          deliveryType,
          // 快递地址快照 (保留完整无脱敏手机号)
          addressId: params.addressId ? String(params.addressId).trim() : (shippingAddress?._id || shippingAddress?.id || ''),
          shippingAddress,
          receiverSnapshot: shippingAddress,
          // 微信小程序订单发货管理结构
          shippingStatus: 'PENDING',
          logisticsCompany: '',
          logisticsCode: '',
          expressCompany: '',
          deliveryCompanyCode: '',
          trackingNo: '',
          shippedAt: null,
          shippingTime: null,
          // 门店自提相关 (彻底取消自提码/核销码)
          pickupInfo,
          pickupPointId: pickupInfo ? pickupInfo.pointId : '',
          pickupPointName: pickupInfo ? pickupInfo.pointName : '',
          pickupPointAddress: pickupInfo ? pickupInfo.address : '',
          pickupStatus: pickupInfo ? 'PREPARING' : '',
          verificationCode: '',
          pickupCode: '',
          pickedUpAt: null,
          completeTime: null,
          completedAt: null,
          // 订单与支付状态
          remark: params.remark ? String(params.remark).slice(0, 200) : '',
          status: 'PENDING_PAYMENT',
          orderStatus: 'PENDING_PAYMENT',
          paymentStatus: 'UNPAID',
          transactionId: '',
          paymentTradeNo: '',
          paidAt: null,
          payTime: null,
          paymentInitiated: false,
          createdAt: now,
          createTime: now,
          updatedAt: now,
          updateTime: now,
          expireAt: new Date(now.getTime() + 30 * 60000)
        };

        const orderData = { ...order };
        delete orderData._id;
        try {
          await tx.collection('orders').doc(orderId).set({ data: orderData });
        } catch (dbErr) {
          await ensureCollection('orders');
          await tx.collection('orders').doc(orderId).set({ data: orderData });
        }
        console.log(`[ORDER-05] 写入 orders 表完成 (orderNo: ${orderNo}), t=${Date.now() - startTime}ms`);

        // 按商品(productId)拆分子订单：相同商品(不同SKU)合并到一个子订单、数量累加
        const groups = new Map();
        for (const item of snapshots) {
          if (!groups.has(item.productId)) groups.set(item.productId, []);
          groups.get(item.productId).push(item);
        }
        for (const [productId, groupItems] of groups) {
          const subOrderId = key(orderId, productId);
          const subOrderNo = `MO${Date.now()}${subOrderId.slice(0, 8)}`;
          const subTotal = groupItems.reduce((sum, it) => sum + it.totalAmount, 0);
          const subMerchantId = groupItems[0].merchantId || null;
          const subOrderData = {
            merchantId: subMerchantId,
            parentOrderId: orderId,
            parentOrderNo: orderNo,
            subOrderNo,
            userId,
            items: groupItems.map(it => ({ ...it, merchantId: subMerchantId })),
            totalAmount: subTotal,
            deliveryType,
            shippingAddress,
            status: 'PENDING_PAYMENT',
            shipments: [],
            createdAt: now,
            updatedAt: now
          };
          try {
            await tx.collection('merchant_orders').doc(subOrderId).set({ data: subOrderData });
          } catch (collectionErr) {
            await ensureCollection('merchant_orders');
            await tx.collection('merchant_orders').doc(subOrderId).set({ data: subOrderData });
          }
        }
        console.log(`[ORDER-05b] 拆分子订单完成 (${groups.size} 个子订单), t=${Date.now() - startTime}ms`);

        // 并行清理已结算的购物车项
        const cartInputs = inputs.filter(i => i.cartId);
        if (cartInputs.length > 0) {
          await Promise.all(cartInputs.map(ci => tx.collection('carts').doc(ci.cartId).remove().catch(() => {})));
        }

        console.log(`[ORDER-06] orders.create 执行完成准备 return, 总耗时=${Date.now() - startTime}ms`);
        return { orderId, orderNo, payAmount };
      };

      if (typeof db.runTransaction === 'function') {
        return success(await db.runTransaction(executeCreate));
      } else {
        return success(await executeCreate(db));
      }
    }

    // 2. 订单列表 (买家看到的是按商品拆分的子订单)
    if (action === 'list') {
      const page = integer(params.page || 1, '页码', 1, 10000);
      const pageSize = integer(params.pageSize || 20, '每页数量', 1, 50);
      const query = { userId };
      if (params.status && params.status !== 'ALL') {
        query.status = text(params.status, '状态', 1, 30);
      }

      let total = 0;
      try {
        const countRes = await db.collection('merchant_orders').where(query).count();
        total = countRes.total || 0;
      } catch (countErr) {
        await ensureCollection('merchant_orders');
      }

      let orderList = [];
      try {
        const listRes = await db.collection('merchant_orders')
          .where(query)
          .orderBy('createdAt', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get();
        orderList = listRes.data || [];
      } catch (sortErr) {
        console.warn('[orders:list] orderBy createdAt failed, fallback:', sortErr);
        try {
          const listRes = await db.collection('merchant_orders')
            .where(query)
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .get();
          orderList = (listRes.data || []).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        } catch (_) {
          orderList = [];
        }
      }

      const formatted = orderList.map(o => ({
        ...o,
        id: o._id || o.id,
        orderNo: o.subOrderNo || o.orderNo,
        payAmount: o.totalAmount || o.payAmount || 0
      }));

      return success({
        list: formatted,
        total: Math.max(total, formatted.length),
        page,
        pageSize,
        hasMore: page * pageSize < total
      });
    }

    // 3. 子订单检索 (买家看到的是子订单；支持 _id / subOrderNo 查询)
    async function findUserSubOrder(targetDb, p) {
      const q = String(p.id || p.orderId || p.orderNo || p.outTradeNo || p.out_trade_no || '').trim();
      if (!q) throw err('INVALID_PARAMS', '缺少订单查询标识');

      // 1. 按子订单 _id 查询
      let sub = await safeDocGet(targetDb, 'merchant_orders', q);
      if (sub) {
        if (sub.userId !== userId) throw err('PERMISSION_DENIED', '订单无权访问');
        return sub;
      }

      // 2. 按 subOrderNo 查询
      try {
        const res = await targetDb.collection('merchant_orders').where({ subOrderNo: q }).limit(1).get();
        if (res.data && res.data.length > 0) {
          sub = res.data[0];
          if (sub.userId !== userId) throw err('PERMISSION_DENIED', '订单无权访问');
          return sub;
        }
      } catch (_) {}

      throw err('ORDER_NOT_FOUND', '订单不存在或无权访问');
    }

    if (action === 'detail') {
      const sub = await findUserSubOrder(db, params);
      return success({ ...sub, id: sub._id || sub.id, orderNo: sub.subOrderNo || sub.orderNo, payAmount: sub.totalAmount || sub.payAmount || 0 });
    }

    // 4. 取消子订单并释放锁定的库存 (合并支付下取消即整笔支付单取消)
    if (action === 'cancel') {
      const sub = await findUserSubOrder(db, params);
      if (sub.status === 'CANCELLED') return success({ status: 'CANCELLED' });
      if (sub.status !== 'PENDING_PAYMENT') throw err('INVALID_ORDER_STATUS', '仅待付款订单支持取消');
      const parentOrderId = sub.parentOrderId || sub._id;

      const executeCancel = async (tx) => {
        const cur = await safeDocGet(tx, 'merchant_orders', sub._id);
        if (cur && cur.status === 'CANCELLED') return { status: 'CANCELLED' };
        if (cur && cur.status !== 'PENDING_PAYMENT') throw err('INVALID_ORDER_STATUS', '订单状态已变更');

        // 释放该支付单下全部锁定库存
        const parent = await safeDocGet(tx, 'orders', parentOrderId);
        const items = (parent && parent.items) || (cur && cur.items) || [];
        for (const item of items) {
          const sku = await safeDocGet(tx, 'product_skus', item.skuId);
          if (sku) {
            const currentLocked = sku.lockedStock || 0;
            const newLocked = Math.max(0, currentLocked - item.count);
            await tx.collection('product_skus').doc(item.skuId).update({
              data: { lockedStock: newLocked, updatedAt: new Date() }
            });
          }
        }

        if (parent) {
          await tx.collection('orders').doc(parentOrderId).update({
            data: {
              status: 'CANCELLED',
              cancelReason: params.reason || '用户主动取消',
              cancelledAt: new Date(),
              updatedAt: new Date()
            }
          });
        }

        // 同步取消该支付单下所有子订单
        try {
          const siblings = await tx.collection('merchant_orders').where({ parentOrderId }).get();
          for (const s of (siblings.data || [])) {
            if (s.status !== 'CANCELLED') {
              await tx.collection('merchant_orders').doc(s._id).update({
                data: { status: 'CANCELLED', cancelReason: params.reason || '用户主动取消', cancelledAt: new Date(), updatedAt: new Date() }
              });
            }
          }
        } catch (_) {}

        return { status: 'CANCELLED' };
      };

      if (typeof db.runTransaction === 'function') {
        return success(await db.runTransaction(executeCancel));
      } else {
        return success(await executeCancel(db));
      }
    }

    // 5. 确认收货 (子订单 SHIPPED -> COMPLETED，聚合父支付单)
    if (action === 'confirmReceive') {
      const sub = await findUserSubOrder(db, params);
      if (sub.status !== 'SHIPPED') throw err('INVALID_ORDER_STATUS', '仅已发货订单支持确认收货');
      await db.collection('merchant_orders').doc(sub._id).update({
        data: { status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() }
      });

      // 若该支付单下所有子订单均已收货，父支付单置 COMPLETED
      if (sub.parentOrderId) {
        try {
          const siblings = await db.collection('merchant_orders').where({ parentOrderId: sub.parentOrderId }).get();
          const allDone = (siblings.data || []).every(s => s.status === 'COMPLETED' || s.status === 'CANCELLED' || s.status === 'REFUNDED');
          if (allDone) {
            await db.collection('orders').doc(sub.parentOrderId).update({
              data: { status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() }
            });
          }
        } catch (_) {}
      }
      return success({ status: 'COMPLETED' });
    }

    // 6. 买家申请退款 (整子订单退，先进入待商家审核)
    if (action === 'applyRefund') {
      const sub = await findUserSubOrder(db, params);
      if (sub.status !== 'PAID' && sub.status !== 'SHIPPED') throw err('INVALID_ORDER_STATUS', '当前状态不可申请退款');
      const refundNo = `RF${key(sub._id)}`;
      await db.collection('refund_records').doc(refundNo).set({ data: {
        orderId: sub._id,
        parentOrderId: sub.parentOrderId || '',
        merchantId: sub.merchantId || null,
        outRefundNo: refundNo,
        totalFee: sub.totalAmount || 0,
        refundFee: sub.totalAmount || 0,
        status: 'PENDING',
        reason: params.reason || '用户申请退款',
        userId,
        createdAt: new Date()
      }});
      await db.collection('merchant_orders').doc(sub._id).update({ data: { status: 'REFUND_PENDING', refundNo, updatedAt: new Date() } });
      return success({ status: 'REFUND_PENDING', refundNo });
    }

    throw err('ACTION_NOT_FOUND', `未知的订单操作: ${action}`);
  } catch (e) {
    console.error('[orders error]:', e);
    return fail(e.code, e.message);
  }
};
