const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database(),c=require('./common/commerce'),shipping=require('./common/wxOrderShippingService'),gateway=require('./common/payGateway');
exports.main=async()=>{
  if(cloud.getWXContext().OPENID)return {success:false,code:'FORBIDDEN_CALLER'};
  const failures=[],results=[],deadline=Date.now()+30000;
  const expired=await db.collection('orders').where({status:db.command.in(['PENDING_PAYMENT','CLOSING']),expireAt:db.command.lte(new Date())}).orderBy('expireAt','asc').limit(30).get();
  for(const order of expired.data){if(Date.now()>deadline)break;try{await c.cancelOrder(db,cloud,order._id,null,'PAYMENT_TIMEOUT');}catch(e){failures.push({orderId:order._id,code:e.code||'SYSTEM_ERROR'});}}
  // Oldest checked first avoids starving older shipments behind the latest ten orders.
  const shipped=await db.collection('orders').where({status:'SHIPPED'}).orderBy('wxCheckedAt','asc').limit(10).get();
  for(const order of shipped.data){if(Date.now()>deadline)break;try{if(['pending','uncertain','uploading','failed'].includes(order.wxShippingSync?.status))await shipping.retryWxShippingSync(cloud,db,order);results.push({orderId:order._id,...await shipping.reconcileOrderWithWechat(cloud,db,order)});}catch(e){await db.collection('orders').doc(order._id).update({data:{wxCheckedAt:new Date()}});failures.push({orderId:order._id,code:e.code||'WECHAT_UNCERTAIN'});}}
  const refunds=await db.collection('refund_records').where({status:'PROCESSING',isTest:false}).orderBy('lastCheckedAt','asc').limit(10).get();
  for(const refund of refunds.data){if(Date.now()>deadline)break;try{const evidence=await gateway.queryRefund(refund.outRefundNo);if(evidence.status==='SUCCESS')await c.finishRefund(db,refund.outRefundNo,evidence);await db.collection('refund_records').doc(refund._id).update({data:{lastCheckedAt:new Date(),wechatStatus:evidence.status}});}catch(e){await db.collection('refund_records').doc(refund._id).update({data:{lastCheckedAt:new Date()}});failures.push({refundNo:refund.outRefundNo,code:e.code||'REFUND_UNCERTAIN'});}}
  return {success:true,processed:expired.data.length,failures,reconciled:results.map(r=>({orderId:r.orderId,status:r.status}))};
};
