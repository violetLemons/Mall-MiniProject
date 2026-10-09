const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce');
const shipping = require('./common/wxOrderShippingService'), { checkText } = require('./common/wechat');
const { success, fail } = require('./common/response');
async function owned(params, userId) {
  const id = params.orderId || params.id, no = params.orderNo || params.outTradeNo || params.out_trade_no || id;
  let order = id ? await c.get(db, 'orders', id) : null;
  if (!order && no) order = (await db.collection('orders').where({ userId, orderNo: no }).limit(1).get()).data[0];
  if (!order || order.userId !== userId) throw c.error('ORDER_NOT_FOUND', '订单不存在'); return order;
}
exports.main = async event => {
  try {
    const userId = cloud.getWXContext().OPENID, params = event.params || {}, action = event.action;
    if (!userId) throw c.error('AUTH_REQUIRED', '请先登录');
    if (action === 'create') return success(await c.createOrder(db, userId, params));
    if (action === 'summary') {
      const filters = {
        ALL: {}, PENDING_PAYMENT: { status: db.command.in(['PENDING_PAYMENT','CLOSING']) },
        PAID: { status: 'PAID' }, SHIPPED: { status: 'SHIPPED' },
        REFUND: { status: db.command.in(['REFUND_PENDING','REFUNDING']) }
      };
      const entries = await Promise.all(Object.entries(filters).map(async ([key, filter]) => [key, (await db.collection('orders').where({ userId, ...filter }).count()).total]));
      return success(Object.fromEntries(entries));
    }
    if (action === 'list') {
      const page = c.integer(params.page || 1, '页码', 1, 10000), pageSize = c.integer(params.pageSize || 20, '每页数量', 1, 100);
      const where = { userId }, status = params.status || 'ALL';
      if (status === 'PENDING_PAYMENT') where.status = db.command.in(['PENDING_PAYMENT','CLOSING']);
      else if (status === 'REFUND') where.status = db.command.in(['REFUND_PENDING','REFUNDING']);
      else if (['PENDING_REVIEW','WAIT_REVIEW'].includes(status)) { where.status = 'COMPLETED'; where.reviewed = db.command.neq(true); }
      else if (status !== 'ALL') { if (!['PENDING_PAYMENT','PAID','SHIPPED','COMPLETED','CANCELLED','REFUNDED'].includes(status)) throw c.error('INVALID_PARAMS', '订单状态无效'); where.status = status; }
      const [list, count] = await Promise.all([db.collection('orders').where(where).orderBy('createdAt','desc').skip((page-1)*pageSize).limit(pageSize).get(), db.collection('orders').where(where).count()]);
      return success({ list: list.data, total: count.total, page, pageSize });
    }
    const order = await owned(params, userId);
    if (action === 'detail') return success(order);
    if (action === 'cancel') return success(await c.cancelOrder(db, cloud, order._id, userId));
    if (action === 'applyRefund') return success(await c.applyRefund(db, order._id, userId, params.reason));
    if (action === 'confirmReceive') {
      if (order.status === 'COMPLETED') return success({ status: 'COMPLETED' });
      if (order.status !== 'SHIPPED') throw c.error('INVALID_ORDER_STATUS', '仅已发货订单可确认收货');
      if (order.isTest || order.payAmount === 0) {
        await c.transaction(db, async tx => { const current = await c.get(tx,'orders',order._id); if (current.status === 'COMPLETED') return; if (current.status !== 'SHIPPED') throw c.error('CONFLICT','状态已变化'); await tx.collection('orders').doc(order._id).update({ data: { status: 'COMPLETED', receivedAt: new Date(), updatedAt: new Date() } }); });
      } else {
        const result = await shipping.reconcileOrderWithWechat(cloud, db, order);
        if (!result.received) throw c.error('WECHAT_RECEIPT_REQUIRED', '请先在微信订单确认收货');
        if (result.status !== 'COMPLETED') throw c.error('CONFLICT', '订单状态已变化，请刷新后再操作');
      }
      return success({ status: 'COMPLETED' });
    }
    if (action === 'review') {
      const rating = c.integer(params.rating, '评分', 1, 5), comment = c.text(params.comment || '', '评价', 0, 500);
      await checkText(cloud, userId, comment, 2);
      const result = await c.transaction(db, async tx => {
        const current = await c.get(tx,'orders',order._id);
        if (current.status !== 'COMPLETED') throw c.error('INVALID_ORDER_STATUS','仅已完成订单可评价');
        if (current.reviewed) return { status: 'COMPLETED', reviewed: true };
        await tx.collection('orders').doc(order._id).update({ data: { reviewed: true, reviewRating: rating, reviewComment: comment, reviewedAt: new Date(), updatedAt: new Date() } });
        return { status: 'COMPLETED', reviewed: true };
      }); return success(result);
    }
    throw c.error('ACTION_NOT_FOUND', '操作不存在');
  } catch (e) { return fail(e.code || 'SYSTEM_ERROR', e.code ? e.message : '订单服务异常'); }
};
