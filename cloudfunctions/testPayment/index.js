// Deployment packager excludes this function from production packages.
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const c = require('./common/commerce');
const { success, fail } = require('./common/response');
const { requireAdmin, requirePermission } = require('./common/authMiddleware');
exports.main = async event => {
  try {
    if (!c.testMode() || process.env.ENABLE_TEST_PAYMENTS !== 'true') throw c.error('FORBIDDEN', '测试支付未启用');
    const admin = await requireAdmin(event, db); requirePermission(admin, 'test.payment');
    const order = await c.get(db, 'orders', c.text(event.params?.orderId, '订单ID'));
    if (!order || !order.isTest) throw c.error('PAYMENT_MODE_MISMATCH', '只能处理隔离测试订单');
    let result;
    if (event.action === 'pay') result = await c.confirmPayment(db, { orderId: order._id, transactionId: `TEST_${order._id}`, totalFee: order.payAmount, openid: order.userId, isTest: true });
    else if (event.action === 'refund') {
      if (order.status === 'REFUNDED') return success({ status: 'REFUNDED' });
      const r = await c.beginRefund(db, order._id, '测试退款'); result = await c.finishRefund(db, r.refundNo);
    } else throw c.error('ACTION_NOT_FOUND', '操作不存在');
    await db.collection('operation_logs').add({ data: { adminId: admin.adminId, adminUsername: admin.username, action: `TEST_${event.action.toUpperCase()}`,
      resourceId: order._id, resourceType: 'ORDER', createdAt: new Date(), isTest: true } });
    return success(result);
  } catch (e) { return fail(e.code, e.message); }
};
