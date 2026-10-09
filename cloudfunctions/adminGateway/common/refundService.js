const c=require('./commerce'), gateway=require('./payGateway');
async function reconcile(db,refund,allowCreate=true) {
  const order=await c.get(db,'orders',refund.orderId);
  if(!order||order.refundNo!==refund._id)throw c.error('CONFLICT','退款记录与订单不匹配');
  if(refund.status==='SUCCESS')return {status:'REFUNDED'};
  if(refund.status!=='PROCESSING')throw c.error('INVALID_ORDER_STATUS','退款须先审批');
  if(order.isTest&&order.payAmount>0)throw c.error('TEST_PAYMENT_REQUIRED','请使用隔离测试退款工具');
  if(order.payAmount===0)return c.finishRefund(db,refund._id,{internal:true,status:'SUCCESS',out_refund_no:refund._id,out_trade_no:order.paymentOrderNo||order.orderNo,amount:{total:0,refund:0,currency:'CNY'}});
  try {
    let evidence;
    try{evidence=await gateway.queryRefund(refund._id);}
    catch(e){
      if(e.code!=='RESOURCE_NOT_EXISTS'||!allowCreate)throw e;
      await c.transaction(db,async tx=>{
        const parent=await c.get(tx,'orders',order.groupId||order._id);
        if(parent.lastRefundRequest!==refund._id&&new Date(parent.refundSubmitAfter||0).getTime()>Date.now())throw c.error('REFUND_BUSY','同一支付批次的退款须间隔一分钟，系统将继续核验');
        await tx.collection('orders').doc(parent._id).update({data:{lastRefundRequest:refund._id,refundSubmitAfter:new Date(Date.now()+60000)}});
      });
      evidence=await gateway.createRefund(order,refund);
    }
    if(evidence.status==='SUCCESS')return c.finishRefund(db,refund._id,evidence);
    if(!['PROCESSING','CLOSED','ABNORMAL'].includes(evidence.status))throw c.error('REFUND_UNCERTAIN','退款状态待核实');
    const requiresAction=['CLOSED','ABNORMAL'].includes(evidence.status);
    await db.collection('refund_records').doc(refund._id).update({data:{wechatStatus:evidence.status,requiresAction,lastError:'',lastCheckedAt:new Date(),updatedAt:new Date()}});
    return {status:'REFUNDING',wechatStatus:evidence.status,requiresAction};
  }catch(e){
    await db.collection('refund_records').doc(refund._id).update({data:{lastError:e.code||'REFUND_UNCERTAIN',lastCheckedAt:new Date(),updatedAt:new Date()}});
    throw e;
  }
}
module.exports={reconcile};
