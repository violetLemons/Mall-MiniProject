const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database(),c=require('./common/commerce'),shipping=require('./common/wxOrderShippingService'),refunds=require('./common/refundService');
exports.main=async()=>{
  if(cloud.getWXContext().OPENID)return {success:false,code:'FORBIDDEN_CALLER'};
  const failures=[],results=[];let processed=0;
  // Independent stage budgets and rotation on failure keep one backlog from starving the others.
  let deadline=Date.now()+20000;
  const expired=await db.collection('orders').where({status:db.command.in(['PENDING_PAYMENT','CLOSING']),isChildOrder:db.command.neq(true),expireAt:db.command.lte(new Date())}).orderBy('updatedAt','asc').limit(15).get();
  for(const order of expired.data){if(Date.now()>deadline)break;processed++;try{await c.cancelOrder(db,cloud,order._id,null,'PAYMENT_TIMEOUT');}catch(e){await db.collection('orders').doc(order._id).update({data:{updatedAt:new Date()}});failures.push({orderId:order._id,code:e.code||'SYSTEM_ERROR'});}}
  deadline=Date.now()+20000;
  const shipped=await db.collection('orders').where({status:'SHIPPED'}).orderBy('wxCheckedAt','asc').limit(10).get();
  for(const order of shipped.data){if(Date.now()>deadline)break;try{await shipping.retryWxShippingSync(cloud,db,order);results.push({orderId:order._id,...await shipping.reconcileOrderWithWechat(cloud,db,order)});}catch(e){await db.collection('orders').doc(order._id).update({data:{wxCheckedAt:new Date()}});failures.push({orderId:order._id,code:e.code||'WECHAT_UNCERTAIN'});}}
  deadline=Date.now()+20000;
  const pending=await db.collection('refund_records').where({status:'PROCESSING',isTest:false,requiresAction:db.command.neq(true)}).orderBy('lastCheckedAt','asc').limit(10).get();
  for(const refund of pending.data){if(Date.now()>deadline)break;try{await refunds.reconcile(db,refund);}catch(e){await db.collection('refund_records').doc(refund._id).update({data:{lastCheckedAt:new Date()}});failures.push({refundNo:refund.outRefundNo,code:e.code||'REFUND_UNCERTAIN'});}}
  return {success:true,processed,failures,reconciled:results.map(r=>({orderId:r.orderId,status:r.status}))};
};
