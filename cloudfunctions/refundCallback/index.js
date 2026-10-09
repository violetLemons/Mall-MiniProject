const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce'), gateway = require('./common/payGateway');
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), isBase64Encoded: false });
exports.main = async event => {
  try {
    if (cloud.getWXContext().OPENID || (event.httpMethod && event.httpMethod !== 'POST')) throw c.error('FORBIDDEN', '仅接受微信 HTTP 通知');
    const notification = gateway.decryptNotification(event);
    if (notification.type !== 'REFUND.SUCCESS') throw c.error('INVALID_PARAMS', '通知事件不支持');
    const data = notification.data;
    await c.finishRefund(db, data.out_refund_no, { ...data, status: data.refund_status });
    await db.collection('wechat_events').doc(c.key('refund', notification.id)).set({ data: { eventId: notification.id, type: notification.type, refundNo: data.out_refund_no, processedAt: new Date() } });
    return reply(200, { code: 'SUCCESS', message: '成功' });
  } catch (e) { console.error('[refundCallback]', e.code || 'NOTIFICATION_FAILED'); return reply(500, { code: 'FAIL', message: '处理失败，请重试' }); }
};
