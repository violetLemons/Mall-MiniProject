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
async function adjustSales(tx, order, sign) {
  for (const item of order.items) {
    const p = await get(tx, 'products', item.productId);
    if (p) await tx.collection('products').doc(p._id).update({ data: { sales: Math.max(0, integer(p.sales || 0, '销量') + sign * item.count), updatedAt: new Date() } });
  }
}
async function changeBalance(tx, userId, delta, businessKey, orderId) {
  integer(Math.abs(delta), '额度变动');
  const id = key(businessKey);
  const existing = await get(tx, 'balance_transactions', id);
  if (existing) {
    if (existing.amount !== delta || existing.userId !== userId) throw error('CONFLICT', '额度流水冲突');
    return;
  }
  const { data } = await tx.collection('users').where({ _openid: userId }).limit(1).get();
  const user = data[0];
  if (!user) throw error('USER_NOT_FOUND', '用户不存在');
  const before = integer(user.balance || 0, '购物额度'), after = integer(before + delta, '剩余额度');
  await tx.collection('users').doc(user._id).update({ data: { balance: after, updatedAt: new Date() } });
  await tx.collection('balance_transactions').doc(id).set({ data: { businessKey, userId, orderId, amount: delta, before, after, createdAt: new Date() } });
}
async function createOrder(db, userId, params) {
  if (!userId) throw error('AUTH_REQUIRED', '请先登录');
  const requestId = text(params.requestId, '下单请求标识', 16, 100);
  if (!Array.isArray(params.items) || !params.items.length || params.items.length > 10) throw error('INVALID_PARAMS', '订单须包含 1~10 款规格');
  const seen = new Set();
  const inputs = params.items.map(i => {
    const skuId = text(i.skuId, '规格ID', 1, 100);
    if (seen.has(skuId)) throw error('DUPLICATE_SKU', '请合并重复规格');
    seen.add(skuId);
    return { skuId, count: integer(i.count, '数量', 1, 5), cartId: i.cartId ? text(i.cartId, '购物车ID', 1, 100) : '' };
  });
  const remark = params.remark ? text(params.remark, '备注', 0, 200) : '';
  const fingerprint = key(inputs, params.addressId || params.shippingAddress || params.receiverSnapshot || null, params.useBalance !== false, remark);
  const id = key(userId, requestId);
  return transaction(db, async tx => {
    const existing = await get(tx, 'orders', id);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) throw error('IDEMPOTENCY_CONFLICT', '同一请求标识不能用于不同订单');
      return { orderId: id, orderNo: existing.orderNo, payAmount: existing.payAmount, totalAmount: existing.totalAmount, balanceAmount: existing.balanceAmount };
    }
    let raw = params.shippingAddress || params.receiverSnapshot;
    if (params.addressId) {
      raw = await get(tx, 'addresses', text(params.addressId, '地址ID', 1, 100));
      if (!raw || raw.userId !== userId) throw error('PERMISSION_DENIED', '收货地址不属于当前用户');
    }
    const shippingAddress = address(raw), snapshots = [];
    for (const input of inputs) {
      const sku = await get(tx, 'product_skus', input.skuId);
      if (!sku || sku.status !== 'ACTIVE') throw error('SKU_NOT_FOUND', '规格不存在或停售');
      const p = await get(tx, 'products', sku.productId);
      if (!p || p.status !== 'ON_SALE' || p.deletedAt) throw error('PRODUCT_OFF_SALE', '商品已下架');
      integer(sku.price, '价格', 1);
      snapshots.push({ productId: sku.productId, skuId: sku._id, productName: p.name, colorName: sku.colorName || '', size: sku.size || '',
        image: sku.colorImage || p.cover || '', unitPrice: sku.price, count: input.count, totalAmount: integer(sku.price * input.count, '商品金额', 1) });
    }
    const totalAmount = integer(snapshots.reduce((s, i) => s + i.totalAmount, 0), '订单金额', 1);
    const { data: users } = await tx.collection('users').where({ _openid: userId }).limit(1).get();
    if (!users[0]) throw error('USER_NOT_FOUND', '请先登录');
    const balanceAmount = params.useBalance === false ? 0 : Math.min(totalAmount, integer(users[0].balance || 0, '购物额度'));
    const payAmount = totalAmount - balanceAmount;
    const order = { userId, orderNo: `SL${id.slice(0, 30)}`, items: snapshots, totalAmount, payAmount, balanceAmount, shippingAddress, remark,
      requestFingerprint: fingerprint, status: 'PENDING_PAYMENT', isTest: testMode(), paymentInitiated: false,
      createdAt: new Date(), updatedAt: new Date(), expireAt: new Date(Date.now() + 30 * 60000) };
    await tx.collection('orders').doc(id).set({ data: order });
    if (balanceAmount) await changeBalance(tx, userId, -balanceAmount, `ORDER_DEBIT:${id}`, id);
    for (const input of inputs) if (input.cartId) {
      const cart = await get(tx, 'carts', input.cartId);
      if (!cart || cart.userId !== userId || cart.skuId !== input.skuId || cart.count < input.count) throw error('PERMISSION_DENIED', '购物车记录不匹配');
      if (cart.count > input.count) await tx.collection('carts').doc(cart._id).update({ data: { count: cart.count - input.count } });
      else await tx.collection('carts').doc(cart._id).remove();
    }
    return { orderId: id, orderNo: order.orderNo, payAmount, totalAmount, balanceAmount };
  });
}
async function confirmPayment(db, e) {
  return transaction(db, async tx => {
    const order = await get(tx, 'orders', e.orderId);
    if (!order) throw error('ORDER_NOT_FOUND', '订单不存在');
    if (!Number.isSafeInteger(e.totalFee) || e.totalFee !== order.payAmount) throw error('AMOUNT_MISMATCH', '支付金额不匹配');
    if (!e.openid || e.openid !== order.userId) throw error('BUYER_MISMATCH', '付款身份不匹配');
    if (Boolean(e.isTest) !== Boolean(order.isTest) || (order.isTest && !testMode())) throw error('PAYMENT_MODE_MISMATCH', '支付环境不匹配');
    text(e.transactionId, '交易号', 1, 100);
    if (order.payAmount === 0 && e.transactionId !== `BALANCE_${order._id}`) throw error('PAYMENT_EVIDENCE_INVALID', '额度支付凭证无效');
    if (order.status === 'CANCELLED') throw error('ORDER_ALREADY_CANCELLED', '已取消订单发生支付，需要对账处理');
    if (!['PENDING_PAYMENT', 'CLOSING'].includes(order.status)) {
      if (order.paymentTradeNo !== e.transactionId) throw error('TRANSACTION_MISMATCH', '交易号不匹配');
      return { orderId: order._id, status: order.status, alreadyProcessed: true };
    }
    const previous = await get(tx, 'payment_transactions', key(e.transactionId));
    if (previous && previous.orderId !== order._id) throw error('TRANSACTION_MISMATCH', '交易号已属于其他订单');
    await adjustSales(tx, order, 1);
    await tx.collection('payment_transactions').doc(key(e.transactionId)).set({ data: {
      orderId: order._id, userId: order.userId, outTradeNo: order.orderNo, transactionId: e.transactionId, totalFee: order.payAmount,
      status: 'SUCCESS', isTest: order.isTest, method: order.payAmount ? 'WECHAT' : 'BALANCE', createdAt: new Date()
    } });
    await tx.collection('orders').doc(order._id).update({ data: { status: 'PAID', paymentTradeNo: e.transactionId, paymentCreatingUntil: null, paidAt: new Date(), updatedAt: new Date() } });
    return { orderId: order._id, status: 'PAID' };
  });
}
async function beginPayment(db, orderId, userId) {
  return transaction(db, async tx => {
    const order = await get(tx, 'orders', orderId);
    if (!order || order.userId !== userId) throw error('ORDER_NOT_FOUND', '订单不存在');
    if (order.status !== 'PENDING_PAYMENT' || new Date(order.expireAt).getTime() <= Date.now()) throw error('INVALID_ORDER_STATUS', '订单已过期或状态不可支付');
    if (new Date(order.paymentCreatingUntil || 0).getTime() > Date.now()) throw error('PAYMENT_BUSY', '支付创建中，请稍后查单');
    if (order.isTest && !testMode()) throw error('PAYMENT_MODE_MISMATCH', '测试订单不可在生产支付');
    const paymentCreatingUntil = new Date(Date.now() + 60000);
    await tx.collection('orders').doc(orderId).update({ data: { paymentInitiated: true, paymentCreatingUntil, updatedAt: new Date() } });
    return order;
  });
}
async function cancelOrder(db, cloud, orderId, userId, reason = '用户取消') {
  const order = await transaction(db, async tx => {
    const o = await get(tx, 'orders', text(orderId, '订单ID', 1, 100));
    if (!o || (userId && o.userId !== userId)) throw error('ORDER_NOT_FOUND', '订单不存在');
    if (o.status === 'CANCELLED') return o;
    if (!['PENDING_PAYMENT', 'CLOSING'].includes(o.status)) throw error('INVALID_ORDER_STATUS', '仅待付款订单可取消');
    if (new Date(o.paymentCreatingUntil || 0).getTime() > Date.now()) throw error('PAYMENT_BUSY', '支付创建中，请稍后查单');
    await tx.collection('orders').doc(orderId).update({ data: { status: 'CLOSING', updatedAt: new Date() } });
    return o;
  });
  if (order.status === 'CANCELLED') return { status: 'CANCELLED' };
  if (!order.isTest && order.payAmount > 0 && order.paymentInitiated) {
    const gateway = require('./payGateway');
    const result = await gateway.queryPayment(cloud, order);
    if (result.tradeState === 'SUCCESS') { await confirmPayment(db, result); throw error('ORDER_ALREADY_PAID', '订单已付款，不能取消'); }
    if (result.tradeState === 'NOTPAY') await gateway.closePayment(order);
    else if (!['CLOSED', 'NOT_FOUND'].includes(result.tradeState)) throw error('PAYMENT_UNCERTAIN', '支付状态待核实，请稍后重试');
  }
  return transaction(db, async tx => {
    const current = await get(tx, 'orders', orderId);
    if (current.status === 'CANCELLED') return { status: 'CANCELLED' };
    if (current.status !== 'CLOSING') throw error('CONFLICT', '订单状态已变化，请刷新');
    if (current.balanceAmount) await changeBalance(tx, current.userId, current.balanceAmount, `ORDER_CANCEL:${orderId}`, orderId);
    await tx.collection('orders').doc(orderId).update({ data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date(), updatedAt: new Date() } });
    return { status: 'CANCELLED' };
  });
}
async function applyRefund(db, orderId, userId, reason) {
  return transaction(db, async tx => {
    const order = await get(tx, 'orders', orderId);
    if (!order || order.userId !== userId) throw error('ORDER_NOT_FOUND', '订单不存在');
    if (['REFUND_PENDING', 'REFUNDING', 'REFUNDED'].includes(order.status)) return { status: order.status, refundNo: order.refundNo };
    if (!['PAID', 'SHIPPED'].includes(order.status)) throw error('INVALID_ORDER_STATUS', '当前订单不支持申请退款');
    const refundNo = `RF${key(orderId, order.refundAttempt || 0)}`;
    await tx.collection('refund_records').doc(refundNo).set({ data: { orderId, userId, outRefundNo: refundNo, totalFee: order.payAmount, refundFee: order.payAmount,
      balanceFee: order.balanceAmount, priorStatus: order.status, status: 'PENDING', isTest: order.isTest, reason: text(reason, '退款原因', 1, 200), createdAt: new Date() } });
    await tx.collection('orders').doc(orderId).update({ data: { status: 'REFUND_PENDING', refundNo, updatedAt: new Date() } });
    return { status: 'REFUND_PENDING', refundNo };
  });
}
async function beginRefund(db, orderId, reason, returnReceived = false) {
  return transaction(db, async tx => {
    const order = await get(tx, 'orders', orderId);
    if (!order) throw error('ORDER_NOT_FOUND', '订单不存在');
    if (order.status === 'REFUNDING' || order.status === 'REFUNDED') return order;
    if (order.status !== 'REFUND_PENDING') throw error('INVALID_ORDER_STATUS', '请先申请退款');
    const refund = await get(tx, 'refund_records', order.refundNo);
    if (!refund || refund.status !== 'PENDING') throw error('CONFLICT', '退款记录异常');
    if (refund.priorStatus === 'SHIPPED' && returnReceived !== true) throw error('RETURN_REQUIRED', '已发货订单须确认收到退货');
    await tx.collection('refund_records').doc(refund._id).update({ data: { status: 'PROCESSING', returnReceived, updatedAt: new Date() } });
    await tx.collection('orders').doc(orderId).update({ data: { status: 'REFUNDING', updatedAt: new Date() } });
    return { ...order, status: 'REFUNDING' };
  });
}
async function rejectRefund(db, orderId, reason) {
  return transaction(db, async tx => {
    const order = await get(tx, 'orders', orderId);
    if (!order || order.status !== 'REFUND_PENDING') throw error('INVALID_ORDER_STATUS', '只能拒绝待审核退款');
    const refund = await get(tx, 'refund_records', order.refundNo);
    if (!refund || refund.status !== 'PENDING') throw error('CONFLICT', '退款记录异常');
    await tx.collection('refund_records').doc(refund._id).update({ data: { status: 'REJECTED', rejectReason: text(reason, '拒绝原因', 1, 200), updatedAt: new Date() } });
    await tx.collection('orders').doc(orderId).update({ data: { status: refund.priorStatus, refundAttempt: (order.refundAttempt || 0) + 1, updatedAt: new Date() } });
    return { status: refund.priorStatus };
  });
}
async function finishRefund(db, refundNo, evidence) {
  return transaction(db, async tx => {
    const refund = await get(tx, 'refund_records', refundNo);
    if (!refund) throw error('RECORD_NOT_FOUND', '退款记录不存在');
    const order = await get(tx, 'orders', refund.orderId);
    if (!order || order.refundNo !== refundNo) throw error('CONFLICT', '退款订单状态异常');
    if (!evidence || evidence.status !== 'SUCCESS' || evidence.out_refund_no !== refundNo || evidence.out_trade_no !== order.orderNo ||
      evidence.amount?.refund !== refund.refundFee || evidence.amount?.total !== refund.totalFee || evidence.amount?.currency !== 'CNY') throw error('REFUND_EVIDENCE_INVALID', '退款凭证不匹配');
    if (refund.refundFee > 0 && !order.isTest) {
      if (evidence.mchid !== require('./payGateway').config().mchId || evidence.transaction_id !== order.paymentTradeNo || !evidence.refund_id) throw error('REFUND_EVIDENCE_INVALID', '退款支付身份不匹配');
    } else if (evidence.internal !== true || (order.isTest && !testMode())) throw error('REFUND_EVIDENCE_INVALID', '内部退款凭证无效');
    if (refund.status === 'SUCCESS') return { status: 'REFUNDED' };
    if (order.status !== 'REFUNDING' || refund.status !== 'PROCESSING') throw error('CONFLICT', '退款状态异常');
    if (refund.balanceFee) await changeBalance(tx, order.userId, refund.balanceFee, `ORDER_REFUND:${order._id}`, order._id);
    await adjustSales(tx, order, -1);
    await tx.collection('orders').doc(order._id).update({ data: { status: 'REFUNDED', refundedAt: new Date(), updatedAt: new Date() } });
    await tx.collection('refund_records').doc(refundNo).update({ data: { status: 'SUCCESS', refundId: evidence.refund_id || `INTERNAL_${refundNo}`, refundedAt: new Date() } });
    return { status: 'REFUNDED' };
  });
}
module.exports = { error, key, text, integer, get, transaction, testMode, address, changeBalance, createOrder, confirmPayment, beginPayment, cancelOrder, applyRefund, beginRefund, rejectRefund, finishRefund };
