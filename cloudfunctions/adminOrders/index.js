const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce'), refunds = require('./common/refundService');
const shipping = require('./common/wxOrderShippingService');
const { requireAdmin } = require('./common/authMiddleware'), { success, fail } = require('./common/response');
async function audit(admin, action, orderId, detail) { await db.collection('operation_logs').add({ data: { adminId: admin.adminId, adminUsername: admin.username, resourceType: 'ORDER', resourceId: orderId, action, detail, createdAt: new Date() } }); }
async function refundOrder(order, params, admin) {
  const current = await c.beginRefund(db, order._id, '', params.returnReceived === true,
    params.waiveReturn === true ? {waiveReturn:true,adminId:admin.adminId,reason:params.waiverReason} : null, admin.adminId);
  if (current.status === 'REFUNDED') return {status:'REFUNDED'};
  return refunds.reconcile(db,await c.get(db,'refund_records',current.refundNo));
}
exports.main = async event => {
  try {
    const admin = await requireAdmin(event, db), { action, params = {} } = event;
    if (action === 'list') {
      const page = c.integer(params.page || 1,'页码',1,10000), pageSize = c.integer(params.pageSize || 50,'每页数量',1,100), where = {isPaymentGroup:db.command.neq(true)};
      if (params.status && params.status !== 'ALL') where.status = params.status;
      if (params.keyword) where.orderNo = db.RegExp({ regexp: c.text(params.keyword,'关键词',1,80).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), options:'i' });
      const [list,count] = await Promise.all([db.collection('orders').where(where).orderBy('createdAt','desc').skip((page-1)*pageSize).limit(pageSize).get(),db.collection('orders').where(where).count()]);
      return success({ list:list.data,total:count.total,page,pageSize });
    }
    const orderId = c.text(params.orderId || params.id,'订单ID'), order = await c.get(db,'orders',orderId);
    if (!order) throw c.error('ORDER_NOT_FOUND','订单不存在');
    if (action === 'get') return success({...order,refundRecord:order.refundNo ? await c.get(db,'refund_records',order.refundNo) : null});
    if (order.isPaymentGroup) throw c.error('INVALID_ORDER_STATUS','付款汇总记录不可作为单件订单操作');
    if (action === 'ship') {
      const trackingNo = c.text(params.trackingNo,'物流单号',5,64);
      if (!/^[a-zA-Z0-9-]+$/.test(trackingNo)) throw c.error('INVALID_PARAMS','物流单号无效');
      const expressCompany = shipping.companyCode(params.expressCompany || params.logisticsCompany);
      await c.transaction(db,async tx => {
        const current = await c.get(tx,'orders',orderId);
        if (current.groupId) {
          const group = await c.get(tx,'orders',current.groupId), parcels = new Set([expressCompany+':'+trackingNo]);
          for(const id of group.childIds){const sibling=await c.get(tx,'orders',id);for(const p of sibling.shipments||[])parcels.add(p.expressCompany+':'+p.trackingNo);}
          if(parcels.size>15)throw c.error('PARCEL_LIMIT','同一次付款最多支持15个不同快递包裹，请合并包裹');
        }
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
      if (params.decision === 'REJECT') { const result = await c.rejectRefund(db,orderId,params.reason,admin.adminId); return success(result); }
      if (params.decision !== 'APPROVE') throw c.error('INVALID_PARAMS','审核结果无效');
      return success(await refundOrder(order,params,admin));
    }
    if (action === 'executeRefund') { await audit(admin,'EXECUTE_REFUND',orderId,{}); return success(await refundOrder(order,params,admin)); }
    if (action === 'queryRefund') {
      const record = await c.get(db,'refund_records',order.refundNo);
      if (!record) throw c.error('RECORD_NOT_FOUND','退款记录不存在');
      return success(await refunds.reconcile(db,record,false));
    }
    if (action === 'retryShippingSync') { await audit(admin,action,orderId,{}); return success(await shipping.retryWxShippingSync(cloud,db,order)); }
    if (action === 'syncWithWechat') return success(await shipping.reconcileOrderWithWechat(cloud,db,order));
    if (action === 'queryWxShipping') return success(await shipping.queryWxShippingStatus(cloud,order));
    throw c.error('ACTION_NOT_FOUND','操作不存在');
  } catch(e) { return fail(e.code || 'SYSTEM_ERROR',e.code ? e.message : '订单管理服务异常'); }
};
