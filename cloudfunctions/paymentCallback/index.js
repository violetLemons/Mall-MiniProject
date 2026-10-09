const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce'), gateway = require('./common/payGateway');
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), isBase64Encoded: false });
exports.main = async event => {
  try {
    if (cloud.getWXContext().OPENID || (event.httpMethod && event.httpMethod !== 'POST')) throw c.error('FORBIDDEN', '仅接受微信 HTTP 通知');
    const notification = gateway.decryptNotification(event);
    if (notification.type !== 'TRANSACTION.SUCCESS') throw c.error('INVALID_PARAMS', '通知事件不支持');
    const result = notification.data;
    const order = (await db.collection('orders').where({ orderNo: result.out_trade_no }).limit(1).get()).data[0];
    if (!order) throw c.error('ORDER_NOT_FOUND', '通知订单不存在');
    const evidence = gateway.paymentEvidence(order, result);
    if (evidence.tradeState !== 'SUCCESS') throw c.error('INVALID_PARAMS', '支付未成功');
    await c.confirmPayment(db, evidence);
    await db.collection('wechat_events').doc(c.key('pay', notification.id)).set({ data: { eventId: notification.id, type: notification.type, orderId: order._id, processedAt: new Date() } });
    return reply(200, { code: 'SUCCESS', message: '成功' });
  } catch (e) { console.error('[paymentCallback]', e.code || 'NOTIFICATION_FAILED'); return reply(500, { code: 'FAIL', message: '处理失败，请重试' }); }
};
