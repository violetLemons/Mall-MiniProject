const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { cancelOrder } = require('./common/commerce');
const wxOrderShippingService = require('./common/wxOrderShippingService');

exports.main = async () => {
  if (cloud.getWXContext().OPENID) return { success: false, code: 'FORBIDDEN_CALLER' };

  // 1. 自动取消超时未付款订单
  const result = await db.collection('orders').where({ status: 'PENDING_PAYMENT', expireAt: db.command.lte(new Date()) }).limit(50).get();
  const failures = [];
  for (const order of result.data) {
    try { await cancelOrder(db, cloud, order._id, null, 'PAYMENT_TIMEOUT'); }
    catch (e) { failures.push({ orderId: order._id, code: e.code || 'SYSTEM_ERROR' }); }
  }

  // 2. 微信发货管理低频增量反向对账 (检查近期已支付/同步失败/冲突订单，每次最多 10 单，杜绝全库耗尽)
  const shippingReconciliation = [];
  try {
    const candidateOrders = await db.collection('orders')
      .where(db.command.or([
        { status: 'PAID' },
        { 'wxShippingSync.status': 'failed' },
        { 'wxShippingSync.status': 'FAILED' },
        { 'wxShippingSync.status': 'conflict' },
        { 'wxShippingSync.status': 'CONFLICT' }
      ]))
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    for (const ord of (candidateOrders.data || [])) {
      try {
        const res = await wxOrderShippingService.reconcileOrderWithWechat(cloud, db, ord);
        shippingReconciliation.push({ orderNo: ord.orderNo, action: res.action, status: res.status });
      } catch (err) {
        shippingReconciliation.push({ orderNo: ord.orderNo, error: err.message });
      }
    }
  } catch (syncErr) {
    console.warn('[orderTimeoutJob] 微信发货定时反向对账异常:', syncErr.message);
  }

  return {
    success: true,
    processed: result.data.length - failures.length,
    failures,
    shippingReconciliation
  };
};
