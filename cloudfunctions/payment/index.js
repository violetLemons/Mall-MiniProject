const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce');
const gateway = require('./common/payGateway');
const { success, fail } = require('./common/response');
async function find(params, userId) {
  const id = params.orderId || params.id;
  let order = id ? await c.get(db, 'orders', id) : null;
  if (!order) { const no = params.orderNo || params.outTradeNo || params.out_trade_no || id; if (no) order = (await db.collection('orders').where({ orderNo: no, userId }).limit(1).get()).data[0]; }
  if (!order || order.userId !== userId) throw c.error('ORDER_NOT_FOUND', '订单不存在');
  if(order.groupId){order=await c.get(db,'orders',order.groupId);if(!order||order.userId!==userId)throw c.error('ORDER_NOT_FOUND','支付批次不存在');}
  return order;
}
exports.main = async event => {
  try {
    const userId = cloud.getWXContext().OPENID;
    if (!userId) throw c.error('AUTH_REQUIRED', '请先登录');
    const params = event.params || {}, order = await find(params, userId);
    if (event.action === 'queryOrder') {
      if (order.payAmount === 0 && order.status === 'PENDING_PAYMENT') return success({ status: order.status, orderId: order._id });
      if (['PENDING_PAYMENT','CLOSING'].includes(order.status) && order.paymentInitiated && !order.isTest) {
        const permitted=await c.transaction(db,async tx=>{
          const latest=await c.get(tx,'orders',order._id);
          if(new Date(latest.paymentQueryAfter||0).getTime()>Date.now())return false;
          await tx.collection('orders').doc(order._id).update({data:{paymentQueryAfter:new Date(Date.now()+5000)}});return true;
        });
        if(!permitted)return success({status:(await c.get(db,'orders',order._id)).status,orderId:order._id});
        const evidence = await gateway.queryPayment(cloud, order);
        if (evidence.tradeState === 'SUCCESS') return success(await c.confirmPayment(db, evidence));
      }
      return success({ status: order.status, orderId: order._id, orderNo: order.orderNo });
    }
    if (event.action !== 'createPayment') throw c.error('ACTION_NOT_FOUND', '操作不存在');
    if (order.isTest && order.payAmount > 0) throw c.error('TEST_PAYMENT_REQUIRED', '测试订单请由隔离测试工具支付');
    const reserved = await c.beginPayment(db, order._id, userId);
    if (reserved.payAmount === 0) {
      await c.confirmPayment(db, { orderId: reserved._id, transactionId: `BALANCE_${reserved._id}`, totalFee: 0, openid: userId, isTest: reserved.isTest });
      return success({ orderId: order._id, orderNo: order.orderNo, paid: true, noPayment: true });
    }
    const payment = await gateway.createPayment(reserved);
    await db.collection('orders').doc(order._id).update({ data: { paymentCreatingUntil: null } });
    return success({ orderId: order._id, orderNo: order.orderNo, payment });
  } catch (e) { return fail(e.code || 'PAYMENT_UNCERTAIN', e.code ? e.message : '支付状态待核实，请查单'); }
};
