const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce'), gateway = require('./common/payGateway');
const shipping = require('./common/wxOrderShippingService');
const { requireAdmin } = require('./common/authMiddleware'), { success, fail } = require('./common/response');
async function audit(admin, action, orderId, detail) { await db.collection('operation_logs').add({ data: { adminId: admin.adminId, adminUsername: admin.username, resourceType: 'ORDER', resourceId: orderId, action, detail, createdAt: new Date() } }); }
async function refundOrder(order, returnReceived) {
  const current = await c.beginRefund(db, order._id, '', returnReceived), refund = await c.get(db, 'refund_records', current.refundNo);
  if (current.status === 'REFUNDED') return { status: 'REFUNDED' };
  if (current.isTest && current.payAmount > 0) throw c.error('TEST_PAYMENT_REQUIRED', '请使用隔离测试退款工具');
  if (current.payAmount === 0) return c.finishRefund(db, refund._id, { internal: true, status: 'SUCCESS', out_refund_no: refund._id, out_trade_no: current.orderNo, amount: { total: 0, refund: 0, currency: 'CNY' } });
  let evidence;
  // Always query before retrying a refund request with the same refund number.
  try { evidence = await gateway.queryRefund(refund._id); }
  catch (e) { if (e.code !== 'RESOURCE_NOT_EXISTS') throw e; evidence = await gateway.createRefund(current, refund); }
  if (evidence.status === 'SUCCESS') return c.finishRefund(db, refund._id, evidence);
  const state = evidence.status;
  if (!['PROCESSING','CLOSED','ABNORMAL'].includes(state)) throw c.error('REFUND_UNCERTAIN', '退款状态待核实');
  await db.collection('refund_records').doc(refund._id).update({ data: { wechatStatus: state, updatedAt: new Date() } });
  return { status: 'REFUNDING', wechatStatus: state };
}
exports.main = async event => {
  try {
    const admin = await requireAdmin(event, db), { action, params = {} } = event;
    if (action === 'list') {
      const page = c.integer(params.page || 1,'页码',1,10000), pageSize = c.integer(params.pageSize || 50,'每页数量',1,100), where = {};
      if (params.status && params.status !== 'ALL') where.status = params.status;
      if (params.keyword) where.orderNo = db.RegExp({ regexp: c.text(params.keyword,'关键词',1,80).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), options:'i' });
      const [list,count] = await Promise.all([db.collection('orders').where(where).orderBy('createdAt','desc').skip((page-1)*pageSize).limit(pageSize).get(),db.collection('orders').where(where).count()]);
      return success({ list:list.data,total:count.total,page,pageSize });
    }
    const orderId = c.text(params.orderId || params.id,'订单ID'), order = await c.get(db,'orders',orderId);
    if (!order) throw c.error('ORDER_NOT_FOUND','订单不存在');
    if (action === 'get') return success(order);
    if (action === 'ship') {
      const trackingNo = c.text(params.trackingNo,'物流单号',5,64);
      if (!/^[a-zA-Z0-9-]+$/.test(trackingNo)) throw c.error('INVALID_PARAMS','物流单号无效');
      const expressCompany = shipping.companyCode(params.expressCompany || params.logisticsCompany);
      await c.transaction(db,async tx => {
        const current = await c.get(tx,'orders',orderId);
        if (current.status === 'SHIPPED' && current.trackingNo === trackingNo && current.expressCompany === expressCompany) return;
        if (current.status !== 'PAID') throw c.error('INVALID_ORDER_STATUS','仅待发货订单可发货');
        await tx.collection('orders').doc(orderId).update({ data: { status:'SHIPPED',trackingNo,expressCompany,logisticsCompany:params.logisticsCompany || expressCompany,
          shipments:[{trackingNo,expressCompany,logisticsCompany:params.logisticsCompany || expressCompany,shippedAt:new Date()}],shippedAt:new Date(),updatedAt:new Date(),wxShippingSync:{status:'pending'} } });
        await tx.collection('operation_logs').add({data:{adminId:admin.adminId,action:'SHIP',resourceId:orderId,trackingNo,expressCompany,createdAt:new Date()}});
      });
      const sync = await shipping.syncExpressShipping(cloud,db,await c.get(db,'orders',orderId)); return success({status:'SHIPPED',wxShippingSync:sync});
    }
    if (action === 'cancel') { const result = await c.cancelOrder(db,cloud,orderId,null,'ADMIN_CANCEL'); await audit(admin,action,orderId,{}); return success(result); }
    if (action === 'reviewRefund') {
      if (params.decision === 'REJECT') { const result = await c.rejectRefund(db,orderId,params.reason); await audit(admin,action,orderId,{decision:params.decision}); return success(result); }
      if (params.decision !== 'APPROVE') throw c.error('INVALID_PARAMS','审核结果无效');
      await audit(admin,'APPROVE_REFUND',orderId,{returnReceived:params.returnReceived === true});
      return success(await refundOrder(order,params.returnReceived === true));
    }
    if (action === 'executeRefund') { await audit(admin,'EXECUTE_REFUND',orderId,{}); return success(await refundOrder(order,params.returnReceived === true)); }
    if (action === 'queryRefund') {
      const record = await c.get(db,'refund_records',order.refundNo);
      if (!record) throw c.error('RECORD_NOT_FOUND','退款记录不存在');
      const evidence = await gateway.queryRefund(record._id);
      if(evidence.status==='SUCCESS') return success(await c.finishRefund(db,record._id,evidence));
      return success({status:order.status,wechatStatus:evidence.status});
    }
    if (action === 'retryShippingSync') { await audit(admin,action,orderId,{}); return success(await shipping.retryWxShippingSync(cloud,db,order)); }
    if (action === 'syncWithWechat') return success(await shipping.reconcileOrderWithWechat(cloud,db,order));
    if (action === 'queryWxShipping') return success(await shipping.queryWxShippingStatus(cloud,order));
    throw c.error('ACTION_NOT_FOUND','操作不存在');
  } catch(e) { return fail(e.code || 'SYSTEM_ERROR',e.code ? e.message : '订单管理服务异常'); }
};
