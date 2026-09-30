const crypto = require('crypto');
const error = (code, message) => Object.assign(new Error(message), { code });
const key = (...parts) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
function text(value, name, min = 1, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw error('INVALID_PARAMS', `${name}格式不正确`);
  return value.trim();
}
function integer(value, name, min = 0, max = 100000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw error('INVALID_PARAMS', `${name}必须为 ${min}~${max} 的整数`);
  return value;
}
async function get(db, collection, id) {
  try {
    const res = await db.collection(collection).doc(id).get();
    return Array.isArray(res.data) ? res.data[0] || null : res.data || null;
  } catch (e) {
    const message = String(e?.message || e?.errMsg || '');
    if (/not.?exist|not found|不存在/i.test(message) || ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(e?.code)) return null;
    throw e;
  }
}
async function transaction(db, fn) {
  if (typeof db.runTransaction !== 'function') throw error('CONFIG_ERROR', '数据库不支持事务');
  const result = await db.runTransaction(fn);
  return result && Object.prototype.hasOwnProperty.call(result, 'result') ? result.result : result;
}
function testMode() {
  // cloud-test is an isolated CloudBase environment; production never enables
  // simulated payment even if a caller sends a test flag.
  return ['local', 'test', 'cloud-test'].includes(process.env.APP_ENV) && process.env.PAYMENT_MODE === 'test';
}
function address(input) {
  if (!input || typeof input !== 'object') throw error('INVALID_ADDRESS', '请选择收货地址');
  const a = {};
  const fieldLabels = {
    name: '收货人姓名',
    phone: '手机号码',
    province: '省份',
    city: '城市',
    district: '区县',
    detail: '详细地址'
  };
  for (const [field, min, max] of [['name', 1, 30], ['phone', 11, 11], ['province', 1, 50], ['city', 1, 50], ['district', 1, 50], ['detail', 1, 300]]) {
    a[field] = text(input[field], fieldLabels[field] || field, min, max);
  }
  if (!/^1[3-9]\d{9}$/.test(a.phone)) throw error('INVALID_ADDRESS', '请输入有效手机号');
  return a;
}
function stockCheck(sku) {
  // 库存已从业务移除，保留函数避免外部引用破坏
}
// 库存字段已从业务中移除；本函数仅保留销量(sales)记账，不再做任何库存锁定/扣减/流水。
async function inventory(tx, order, operation) {
  if (operation !== 'PAYMENT_CONFIRMED' && operation !== 'REFUND_RESTORE') return;
  for (const item of order.items) {
    const p = await get(tx, 'products', item.productId);
    if (p) await tx.collection('products').doc(item.productId).update({ data: {
      sales: Math.max(0, (p.sales || 0) + (operation === 'PAYMENT_CONFIRMED' ? item.count : -item.count)),
      updatedAt: new Date()
    } });
  }
}
async function createOrder(db, userId, params) {
  if (!userId) throw error('AUTH_REQUIRED', '请先登录');
  // 客户端应提供幂等标识；服务端为旧客户端生成一次性标识，避免把同一请求永久拒绝。
  const requestId = text(params.requestId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : key(Date.now(), Math.random(), String(Math.random()))), '下单请求标识', 16, 100);
  if (!Array.isArray(params.items) || !params.items.length || params.items.length > 10) throw error('INVALID_PARAMS', '订单须包含 1~10 款规格');
  const seen = new Set();
  const inputs = params.items.map(i => {
    const skuId = text(i.skuId, '规格ID', 1, 100);
    if (seen.has(skuId)) throw error('DUPLICATE_SKU', '请合并重复规格');
    seen.add(skuId);
    return { skuId, count: integer(i.count, '数量', 1, 5), cartId: i.cartId ? text(i.cartId, '购物车ID', 1, 100) : '' };
  });
  const deliveryType = params.deliveryType || 'DELIVERY';
  if (!['DELIVERY', 'PICKUP'].includes(deliveryType)) throw error('INVALID_DELIVERY_TYPE', '配送方式无效');
  const fingerprint = key(inputs, deliveryType, params.addressId || params.shippingAddress || null, params.pickupPointId || '', params.remark || '');
  const id = key(userId, requestId);
  return transaction(db, async tx => {
    const existing = await get(tx, 'orders', id);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw error('IDEMPOTENCY_CONFLICT', '同一请求标识不能用于不同订单');
      return { orderId: id, orderNo: existing.orderNo, payAmount: existing.payAmount };
    }
    let shippingAddress = null, pickupInfo = null;
    if (deliveryType === 'DELIVERY') {
      let raw = params.shippingAddress;
      if (params.addressId) {
        raw = await get(tx, 'addresses', text(params.addressId, '地址ID', 1, 100));
        if (!raw || raw.userId !== userId) throw error('PERMISSION_DENIED', '收货地址不属于当前用户');
      }
      shippingAddress = address(raw);
    } else {
      const point = await get(tx, 'pickup_points', text(params.pickupPointId, '自提点ID', 1, 100));
      if (!point || point.status !== 'ACTIVE') throw error('INVALID_PICKUP_POINT', '自提点不存在或暂停营业');
      pickupInfo = { pointId: point._id, pointName: point.name, address: point.address || '', pickupCode: '', pickupStatus: 'PREPARING' };
    }
    const snapshots = [];
    for (const input of inputs) {
      const sku = await get(tx, 'product_skus', input.skuId);
      if (!sku || sku.status !== 'ACTIVE') throw error('SKU_NOT_FOUND', '规格不存在或停售');
      const p = await get(tx, 'products', sku.productId);
      if (!p || p.status !== 'ON_SALE' || p.deletedAt) throw error('PRODUCT_OFF_SALE', '商品已下架');
      integer(sku.price, '价格', 1);
      snapshots.push({ productId: sku.productId, skuId: sku._id, productName: p.name, colorName: sku.colorName || '', size: sku.size,
        image: sku.colorImage || p.cover || '', unitPrice: sku.price, count: input.count, totalAmount: sku.price * input.count });
    }
    const payAmount = integer(snapshots.reduce((s, i) => s + i.totalAmount, 0), '订单金额', 1);
    const order = { _id: id, userId, orderNo: `SL${Date.now()}${id.slice(0, 8)}`, items: snapshots, totalAmount: payAmount, payAmount,
      deliveryType, shippingAddress, pickupInfo, remark: params.remark ? text(params.remark, '备注', 0, 200) : '',
      requestFingerprint: fingerprint, status: 'PENDING_PAYMENT', inventoryVersion: 2, isTest: testMode(), paymentInitiated: false,
      createdAt: new Date(), updatedAt: new Date(), expireAt: new Date(Date.now() + 30 * 60000) };
    await inventory(tx, order, 'LOCK');
    const orderData = { ...order };
    delete orderData._id;
    await tx.collection('orders').doc(id).set({ data: orderData });
    for (const input of inputs) if (input.cartId) {
      const cart = await get(tx, 'carts', input.cartId);
      if (!cart || cart.userId !== userId || cart.skuId !== input.skuId) throw error('PERMISSION_DENIED', '购物车记录不匹配');
      if (cart.count > input.count) await tx.collection('carts').doc(cart._id).update({ data: { count: cart.count - input.count } });
      else await tx.collection('carts').doc(cart._id).remove();
    }
    return { orderId: id, orderNo: order.orderNo, payAmount };
  });
}
function assertVersion(order) {
  // 库存版本已无意义，不再校验
}
async function confirmPayment(db, e) {
  return transaction(db, async tx => {
    const order = await get(tx, 'orders', e.orderId);
    if (!order) throw error('ORDER_NOT_FOUND', '订单不存在');
    assertVersion(order);
    if (!Number.isSafeInteger(e.totalFee) || e.totalFee !== order.payAmount) throw error('AMOUNT_MISMATCH', '支付金额不匹配');
    if (!e.openid || e.openid !== order.userId) throw error('BUYER_MISMATCH', '付款身份不匹配');
    if (Boolean(e.isTest) !== Boolean(order.isTest)) throw error('PAYMENT_MODE_MISMATCH', '支付环境不匹配');
    text(e.transactionId, '交易号', 1, 100);
    if (order.status === 'CANCELLED') throw error('ORDER_ALREADY_CANCELLED', '已取消订单发生支付，需要对账处理');
    if (order.status !== 'PENDING_PAYMENT') {
      if (order.paymentTradeNo !== e.transactionId) throw error('TRANSACTION_MISMATCH', '交易号不匹配');
      return { orderId: order._id, status: order.status, alreadyProcessed: true };
    }
    const previous = await get(tx, 'payment_transactions', key(e.transactionId));
    if (previous && previous.orderId !== order._id) throw error('TRANSACTION_MISMATCH', '交易号已属于其他订单');
    await inventory(tx, order, 'PAYMENT_CONFIRMED');
    await tx.collection('payment_transactions').doc(key(e.transactionId)).set({ data: {
      orderId: order._id, userId: order.userId, outTradeNo: order.orderNo, transactionId: e.transactionId, totalFee: order.payAmount,
      status: 'SUCCESS', isTest: order.isTest, createdAt: new Date()
    } });
    await tx.collection('orders').doc(order._id).update({ data: { status: 'PAID', paymentTradeNo: e.transactionId, paidAt: new Date(), updatedAt: new Date() } });
    // 合并支付：同步该支付单下所有子订单为 PAID（子订单集合可能尚不存在，容错处理）
    try {
      const subs = await tx.collection('merchant_orders').where({ parentOrderId: order._id }).get();
      for (const s of (subs.data || [])) {
        if (s.status === 'PENDING_PAYMENT') await tx.collection('merchant_orders').doc(s._id).update({ data: { status: 'PAID', paidAt: new Date(), updatedAt: new Date() } });
      }
    } catch (subErr) {
      console.warn('[confirmPayment] merchant_orders sync warn:', subErr && subErr.message);
    }
    return { orderId: order._id, status: 'PAID' };
  });
}
async function cancelOrder(db, cloud, orderId, userId, reason = '用户取消') {
  const order = await get(db, 'orders', text(orderId, '订单ID', 1, 100));
  if (!order) throw error('ORDER_NOT_FOUND', '订单不存在');
  if (userId && order.userId !== userId) throw error('PERMISSION_DENIED', '无权操作此订单');
  assertVersion(order);
  if (order.status === 'CANCELLED') return { status: 'CANCELLED' };
  if (order.status !== 'PENDING_PAYMENT') throw error('INVALID_ORDER_STATUS', '仅待付款订单可取消');
  if (!order.isTest && order.paymentInitiated) {
    const { queryPayment } = require('./payGateway');
    const { getWechatPayMerchantId } = require('./config');
    const result = await queryPayment(cloud, order);
    if (result.tradeState === 'SUCCESS') { await confirmPayment(db, result); throw error('ORDER_ALREADY_PAID', '订单已付款，不能取消'); }
    if (!['NOTPAY', 'CLOSED', 'NOT_FOUND'].includes(result.tradeState)) throw error('PAYMENT_UNCERTAIN', '支付状态待核实，请稍后重试');
    if (result.tradeState === 'NOTPAY') {
      const close = await cloud.cloudPay.closeOrder({ outTradeNo: order.orderNo, subMchId: getWechatPayMerchantId() });
      if (close.returnCode !== 'SUCCESS' || close.resultCode !== 'SUCCESS') throw error('CLOSE_ORDER_FAILED', '微信关单失败，请稍后重试');
    }
  }
  // 余额抵扣部分需退还：自包含订单(orders/index.js)写 balanceAmount；commerce 订单无此字段则跳过
  const balanceUsed = Number(order.balanceAmount) || 0;
  let refundUserDocId = null;
  if (balanceUsed > 0) {
    const userRes = await db.collection('users').where({ _openid: order.userId }).limit(1).get().catch(() => ({ data: [] }));
    refundUserDocId = (userRes.data && userRes.data[0] && userRes.data[0]._id) || null;
  }
  return transaction(db, async tx => {
    const current = await get(tx, 'orders', orderId);
    if (current.status === 'CANCELLED') return { status: 'CANCELLED' };
    if (current.status !== 'PENDING_PAYMENT' || current.paymentInitiated !== order.paymentInitiated) throw error('CONFLICT', '订单状态已变化，请刷新');
    await inventory(tx, current, 'ORDER_CANCEL');
    if (balanceUsed > 0 && refundUserDocId) {
      const u = await get(tx, 'users', refundUserDocId);
      if (u) await tx.collection('users').doc(refundUserDocId).update({ data: { balance: (Number(u.balance) || 0) + balanceUsed, updatedAt: new Date() } });
    }
    await tx.collection('orders').doc(orderId).update({ data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), updatedAt: new Date() } });
    // 合并支付：同步该支付单下所有子订单为 CANCELLED，避免买家端仍显示待付款并二次退款（子订单集合可能尚不存在，容错处理）
    try {
      const subs = await tx.collection('merchant_orders').where({ parentOrderId: orderId }).get();
      for (const s of (subs.data || [])) {
        if (s.status !== 'CANCELLED') await tx.collection('merchant_orders').doc(s._id).update({ data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), updatedAt: new Date() } });
      }
    } catch (subErr) {
      console.warn('[cancelOrder] merchant_orders sync warn:', subErr && subErr.message);
    }
    return { status: 'CANCELLED' };
  });
}
async function beginRefund(db, orderId, reason) {
  return transaction(db, async tx => {
    const order = await get(tx, 'orders', orderId);
    if (!order) throw error('ORDER_NOT_FOUND', '订单不存在');
    assertVersion(order);
    if (order.status === 'REFUNDING') return order;
    if (order.status !== 'PAID') throw error('INVALID_ORDER_STATUS', '仅未履约的已付款订单支持退款');
    const refundNo = `RF${key(orderId)}`;
    await tx.collection('refund_records').doc(refundNo).set({ data: { orderId, outRefundNo: refundNo, totalFee: order.payAmount, refundFee: order.payAmount,
      status: 'PROCESSING', isTest: order.isTest, reason, createdAt: new Date() } });
    await tx.collection('orders').doc(orderId).update({ data: { status: 'REFUNDING', refundNo, updatedAt: new Date() } });
    return { ...order, refundNo, status: 'REFUNDING' };
  });
}
async function finishRefund(db, refundNo) {
  return transaction(db, async tx => {
    const refund = await get(tx, 'refund_records', refundNo);
    if (!refund) throw error('RECORD_NOT_FOUND', '退款记录不存在');
    if (refund.status === 'SUCCESS') return { status: 'REFUNDED' };
    const order = await get(tx, 'orders', refund.orderId);
    if (!order || order.status !== 'REFUNDING' || order.refundNo !== refundNo) throw error('CONFLICT', '退款订单状态异常');
    assertVersion(order);
    await inventory(tx, order, 'REFUND_RESTORE');
    await tx.collection('orders').doc(order._id).update({ data: { status: 'REFUNDED', updatedAt: new Date() } });
    await tx.collection('refund_records').doc(refundNo).update({ data: { status: 'SUCCESS', refundedAt: new Date() } });
    return { status: 'REFUNDED' };
  });
}
module.exports = { error, key, text, integer, get, transaction, testMode, address, stockCheck, createOrder, confirmPayment, cancelOrder, beginRefund, finishRefund };
