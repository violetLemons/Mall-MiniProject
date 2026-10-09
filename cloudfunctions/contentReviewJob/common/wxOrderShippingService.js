const c = require('./commerce');
const { call } = require('./wechat');
const COMPANIES = { '顺丰速运': 'SF', '顺丰': 'SF', '中通快递': 'ZTO', '圆通速递': 'YTO', '韵达快递': 'YD', '申通快递': 'STO', '京东物流': 'JD', '极兔速递': 'JTSD', '邮政EMS': 'EMS', '德邦快递': 'DBL' };
function companyCode(value) { const code = COMPANIES[value] || value; if (!['SF','ZTO','YTO','YD','STO','JD','JTSD','EMS','DBL'].includes(code)) throw c.error('INVALID_PARAMS', '请选择支持的物流公司编码'); return code; }
async function queryWxShippingStatus(cloud, order) {
  const merchantId = process.env.WECHAT_PAY_MCH_ID;
  if (!merchantId) throw c.error('CONFIG_ERROR', '微信支付商户号未配置');
  // get_order identity is top-level; upload_shipping_info uses nested order_key.
  return call(cloud, 'wxa.sec.order.getOrder', '/wxa/sec/order/get_order', { merchant_id: merchantId, merchant_trade_no: order.orderNo });
}
function remoteOrder(response) { return response.order || response.data?.order || response; }
function matches(order, remote) {
  const parcels = remote.shipping?.shipping_list || remote.shipping_list || [];
  const expected = order.shipments || [];
  return expected.length > 0 && parcels.length === expected.length && expected.every(p => parcels.some(r => r.tracking_no === p.trackingNo && r.express_company === p.expressCompany));
}
async function syncExpressShipping(cloud, db, order) {
  if (order.isTest || order.payAmount === 0) {
    const result = { status: 'not_required', reason: order.isTest ? 'isolated_test' : 'balance_only' };
    await db.collection('orders').doc(order._id).update({ data: { wxShippingSync: result } }); return result;
  }
  if (!order.paymentTradeNo || !order.shipments?.length || order.shipments.length > 15) throw c.error('INVALID_PARAMS', '缺少有效发货资料');
  const previous = order.wxShippingSync || {};
  if (previous.status === 'synced') return previous;
  // Query first after any potentially submitted request. Never blindly upload again after a timeout.
  if (['uploading', 'uncertain', 'failed'].includes(previous.status)) {
    const remote = remoteOrder(await queryWxShippingStatus(cloud, order));
    if (matches(order, remote)) {
      const result = { status: 'synced', syncedAt: new Date() }; await db.collection('orders').doc(order._id).update({ data: { wxShippingSync: result } }); return result;
    }
    if ([2, 3, 4, 5, 6].includes(remote.order_state)) {
      const result = { status: 'conflict', message: '微信已有履约或退款记录，须人工核对', checkedAt: new Date() };
      await db.collection('orders').doc(order._id).update({ data: { wxShippingSync: result } }); return result;
    }
  }
  const lease = await c.transaction(db, async tx => {
    const current = await c.get(tx, 'orders', order._id);
    if (!current || !['SHIPPED','COMPLETED'].includes(current.status)) throw c.error('INVALID_ORDER_STATUS', '当前状态不可同步发货');
    if (current.wxShippingSync?.status === 'synced') return false;
    if (current.wxShippingSync?.status === 'uploading' && new Date(current.wxShippingSync.startedAt).getTime() > Date.now() - 60000) throw c.error('CONFLICT', '发货同步中');
    await tx.collection('orders').doc(order._id).update({ data: { wxShippingSync: { status: 'uploading', startedAt: new Date(), retryCount: (previous.retryCount || 0) + 1 } } }); return true;
  });
  if (!lease) return { status: 'synced' };
  try {
    const shipping_list = order.shipments.map(p => ({ tracking_no: p.trackingNo, express_company: companyCode(p.expressCompany), item_desc: order.items.map(i => `${i.productName}×${i.count}`).join('、').slice(0, 120),
      ...(p.expressCompany === 'SF' ? { contact: { receiver_contact: `****${order.shippingAddress.phone.slice(-4)}` } } : {}) }));
    await call(cloud, 'wxa.sec.order.uploadShippingInfo', '/wxa/sec/order/upload_shipping_info', { order_key: { order_number_type: 2, transaction_id: order.paymentTradeNo },
      logistics_type: 1, delivery_mode: shipping_list.length > 1 ? 2 : 1, is_all_delivered: true, shipping_list, upload_time: new Date().toISOString(), payer: { openid: order.userId } });
    const result = { status: 'synced', syncedAt: new Date(), retryCount: (previous.retryCount || 0) + 1 };
    await db.collection('orders').doc(order._id).update({ data: { wxShippingSync: result } }); return result;
  } catch (e) {
    const result = { status: 'uncertain', message: '微信上报未确认，重试前先查单', retryCount: (previous.retryCount || 0) + 1, nextRetryAt: new Date(Date.now() + 5 * 60000) };
    await db.collection('orders').doc(order._id).update({ data: { wxShippingSync: result } }); return result;
  }
}
async function reconcileOrderWithWechat(cloud, db, order) {
  if (order.isTest || order.payAmount === 0) { await db.collection('orders').doc(order._id).update({ data: { wxCheckedAt: new Date() } }); return { status: order.status, notRequired: true }; }
  const remote = remoteOrder(await queryWxShippingStatus(cloud, order));
  // 5 is refunded and 6 awaiting settlement: neither means receipt confirmed.
  const received = [3, 4].includes(remote.order_state);
  await c.transaction(db, async tx => {
    const current = await c.get(tx, 'orders', order._id);
    if (!current) throw c.error('ORDER_NOT_FOUND', '订单不存在');
    const updates = { wxOrderState: remote.order_state, wxCheckedAt: new Date() };
    if (received && current.status === 'SHIPPED') Object.assign(updates, { status: 'COMPLETED', receivedAt: new Date(), updatedAt: new Date() });
    await tx.collection('orders').doc(order._id).update({ data: updates });
  });
  return { ...(await c.get(db, 'orders', order._id)), received };
}
async function reconcileBatchOrders(cloud, db, orders) { const results = []; for (const order of orders) { try { results.push(await reconcileOrderWithWechat(cloud, db, order)); } catch (e) { results.push({ orderId: order._id, error: e.code || 'WECHAT_UNCERTAIN' }); } } return results; }
module.exports = { companyCode, queryWxShippingStatus, syncExpressShipping, reconcileOrderWithWechat, reconcileBatchOrders, retryWxShippingSync: syncExpressShipping };
