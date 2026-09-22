const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const c = require('./common/commerce');
const { queryPayment } = require('./common/payGateway');
exports.main = async event => {
  if (cloud.getWXContext().OPENID || cloud.getWXContext().SOURCE === 'wx_client') return { errcode: 1, errmsg: 'FORBIDDEN_CALLER' };
  try {
    const orderNo = c.text(event.outTradeNo || event.out_trade_no, '订单号');
    const res = await db.collection('orders').where({ orderNo }).limit(1).get();
    const order = res.data[0];
    if (!order || order.isTest) throw c.error('ORDER_NOT_FOUND', '真实订单不存在');
    const evidence = await queryPayment(cloud, order);
    if (evidence.tradeState !== 'SUCCESS') throw c.error('PAYMENT_UNCERTAIN', '支付未确认');
    await c.confirmPayment(db, evidence);
    return { errcode: 0, errmsg: 'SUCCESS' };
  } catch (e) {
    console.error('[paymentCallback]', e.code || 'SYSTEM_ERROR');
    return { errcode: 1, errmsg: e.code || 'SYSTEM_ERROR' };
  }
};
