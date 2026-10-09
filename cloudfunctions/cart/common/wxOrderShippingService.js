const c = require('./commerce');
const { call } = require('./wechat');
const COMPANIES = { '顺丰速运':'SF','顺丰':'SF','中通快递':'ZTO','圆通速递':'YTO','韵达快递':'YD','申通快递':'STO','京东物流':'JD','极兔速递':'JTSD','邮政EMS':'EMS','德邦快递':'DBL' };
function companyCode(value) { const code=COMPANIES[value]||value; if(!['SF','ZTO','YTO','YD','STO','JD','JTSD','EMS','DBL'].includes(code))throw c.error('INVALID_PARAMS','请选择支持的物流公司编码'); return code; }
async function queryWxShippingStatus(cloud,order) {
  if(!process.env.WECHAT_PAY_MCH_ID)throw c.error('CONFIG_ERROR','微信支付商户号未配置');
  return call(cloud,'wxa.sec.order.getOrder','/wxa/sec/order/get_order',{merchant_id:process.env.WECHAT_PAY_MCH_ID,merchant_trade_no:order.paymentOrderNo||order.orderNo});
}
function remoteOrder(response){return response.order||response.data?.order||response;}
async function snapshot(db,order){
  const root=order.groupId ? await c.get(db,'orders',order.groupId) : await c.get(db,'orders',order._id);
  if(!root)throw c.error('ORDER_NOT_FOUND','付款记录不存在');
  const children=root.isPaymentGroup ? await Promise.all(root.childIds.map(id=>c.get(db,'orders',id))) : [root];
  if(children.some(x=>!x))throw c.error('CONFLICT','分单记录缺失');
  const parcels=new Map();
  for(const child of children)for(const p of child.shipments||[]){
    const id=p.expressCompany+':'+p.trackingNo;
    const entry=parcels.get(id)||{...p,items:[]};
    entry.items.push(...child.items);parcels.set(id,entry);
  }
  const shipments=[...parcels.values()].sort((a,b)=>(a.expressCompany+':'+a.trackingNo).localeCompare(b.expressCompany+':'+b.trackingNo));
  const allDelivered=children.every(x=>Boolean(x.shipments?.length)||x.status==='REFUNDED');
  const signature=c.key(shipments.map(p=>[p.expressCompany,p.trackingNo,p.items]),allDelivered);
  return {root,children,shipments,allDelivered,signature};
}
function matches(s,remote){
  const info=remote.shipping||remote,parcels=info.shipping_list||[];
  return s.shipments.length>0 && parcels.length===s.shipments.length &&
    s.shipments.every(p=>parcels.some(r=>r.tracking_no===p.trackingNo&&r.express_company===p.expressCompany)) &&
    (!s.root.isPaymentGroup || info.is_all_delivered===s.allDelivered);
}
async function syncExpressShipping(cloud,db,order){
  let s=await snapshot(db,order),previous=s.root.wxShippingSync||{};
  if(s.root.isTest||s.root.payAmount===0){
    const result={status:'not_required',reason:s.root.isTest?'isolated_test':'balance_only'};
    await db.collection('orders').doc(order._id).update({data:{wxShippingSync:result}});return result;
  }
  if(!s.root.paymentTradeNo||!s.shipments.length||s.shipments.length>15)throw c.error('INVALID_PARAMS','缺少有效发货资料或包裹超过15个');
  if(previous.status==='synced'&&previous.signature===s.signature)return previous;
  if(previous.status==='uploading'&&new Date(previous.startedAt).getTime()>Date.now()-60000)throw c.error('CONFLICT','同一付款批次正在同步发货');
  if(['uploading','uncertain','failed'].includes(previous.status)){
    const remote=remoteOrder(await queryWxShippingStatus(cloud,s.root));
    if(matches(s,remote)){
      const result={status:'synced',signature:s.signature,allDelivered:s.allDelivered,syncedAt:new Date()};
      await db.collection('orders').doc(s.root._id).update({data:{wxShippingSync:result}});return result;
    }
    // Receipt/refund states must not be overwritten with a new shipping upload.
    if([3,4,5,6].includes(remote.order_state)) {
      const result={status:'conflict',message:'微信已有收货或退款记录，须人工核对',checkedAt:new Date()};
      await db.collection('orders').doc(s.root._id).update({data:{wxShippingSync:result}});
      await db.collection('orders').doc(order._id).update({data:{wxShippingSync:result}});
      return result;
    }
  }
  const signature=await c.transaction(db,async tx=>{
    const latest=await snapshot(tx,order);
    if(!['SHIPPED','COMPLETED','REFUND_PENDING','REFUNDING','REFUNDED'].includes((await c.get(tx,'orders',order._id)).status))throw c.error('INVALID_ORDER_STATUS','当前状态不可同步发货');
    if(latest.root.wxShippingSync?.status==='uploading'&&new Date(latest.root.wxShippingSync.startedAt).getTime()>Date.now()-60000)throw c.error('CONFLICT','发货同步中');
    s=latest;
    await tx.collection('orders').doc(s.root._id).update({data:{wxShippingSync:{status:'uploading',signature:s.signature,allDelivered:s.allDelivered,startedAt:new Date()}}});
    return s.signature;
  });
  let result;
  try{
    const shipping_list=s.shipments.map(p=>({tracking_no:p.trackingNo,express_company:companyCode(p.expressCompany),item_desc:p.items.map(i=>i.productName+'×'+i.count).join('、').slice(0,120),
      ...(p.expressCompany==='SF'?{contact:{receiver_contact:'****'+s.root.shippingAddress.phone.slice(-4)}}:{})}));
    await call(cloud,'wxa.sec.order.uploadShippingInfo','/wxa/sec/order/upload_shipping_info',{
      order_key:{order_number_type:2,transaction_id:s.root.paymentTradeNo},logistics_type:1,
      delivery_mode:s.root.isPaymentGroup||shipping_list.length>1?2:1,is_all_delivered:s.allDelivered,
      shipping_list,upload_time:new Date().toISOString(),payer:{openid:s.root.userId}
    });
    result={status:'synced',signature,allDelivered:s.allDelivered,syncedAt:new Date()};
  }catch(e){result={status:'uncertain',signature,allDelivered:s.allDelivered,message:'微信上报未确认，重试前先查单',nextRetryAt:new Date(Date.now()+300000)};}
  await c.transaction(db,async tx=>{
    const current=await c.get(tx,'orders',s.root._id);
    if(current.wxShippingSync?.signature!==signature)throw c.error('CONFLICT','发货同步版本已变化');
    await tx.collection('orders').doc(s.root._id).update({data:{wxShippingSync:result}});
    for(const child of s.children)if(child.shipments?.length)await tx.collection('orders').doc(child._id).update({data:{wxShippingSync:result}});
  });
  return result;
}
async function reconcileOrderWithWechat(cloud,db,order){
  const s=await snapshot(db,order);
  if(s.root.isTest||s.root.payAmount===0){await db.collection('orders').doc(order._id).update({data:{wxCheckedAt:new Date()}});return {status:order.status,notRequired:true};}
  const remote=remoteOrder(await queryWxShippingStatus(cloud,s.root));
  const received=[3,4].includes(remote.order_state) && (!s.root.isPaymentGroup || (s.allDelivered&&s.root.wxShippingSync?.status==='synced'&&s.root.wxShippingSync.signature===s.signature&&s.root.wxShippingSync.allDelivered===true));
  await c.transaction(db,async tx=>{
    const current=await c.get(tx,'orders',order._id);
    if(!current)throw c.error('ORDER_NOT_FOUND','订单不存在');
    const updates={wxOrderState:remote.order_state,wxCheckedAt:new Date()};
    if(received&&current.status==='SHIPPED')Object.assign(updates,{status:'COMPLETED',receivedAt:new Date(),updatedAt:new Date()});
    await tx.collection('orders').doc(order._id).update({data:updates});
  });
  return {...await c.get(db,'orders',order._id),received};
}
async function reconcileBatchOrders(cloud,db,orders){const results=[];for(const order of orders){try{results.push(await reconcileOrderWithWechat(cloud,db,order));}catch(e){results.push({orderId:order._id,error:e.code||'WECHAT_UNCERTAIN'});}}return results;}
module.exports={companyCode,queryWxShippingStatus,syncExpressShipping,reconcileOrderWithWechat,reconcileBatchOrders,retryWxShippingSync:syncExpressShipping,snapshot};
