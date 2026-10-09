const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('crypto');
const { createDb } = require('../lib/local-db');
const c = require('../../cloudfunctions/common/commerce');
process.env.APP_ENV='test'; process.env.PAYMENT_MODE='test';
const address={name:'测试',phone:'13800138000',province:'广东',city:'深圳',district:'南山',detail:'测试地址'};
function fixture(balance=0){return createDb({users:[{_id:'u',_openid:'buyer',balance}],products:[{_id:'p',name:'商品',status:'ON_SALE',sales:0}],product_skus:[{_id:'s',productId:'p',status:'ACTIVE',price:1000}],carts:[{_id:'cart',userId:'other',skuId:'s',count:1}]});}
const params=()=>({requestId:'request-1234567890',shippingAddress:address,items:[{skuId:'s',count:1,price:1}]});
async function paid(db){const r=await c.createOrder(db,'buyer',params());const o=await c.get(db,'orders',r.orderId);await c.confirmPayment(db,{orderId:o._id,totalFee:o.payAmount,openid:'buyer',transactionId:o.payAmount?'TEST_TX':`BALANCE_${o._id}`,isTest:true});return o;}
test('server prices and idempotent balance debit',async()=>{const db=fixture(500);const [a,b]=await Promise.all([c.createOrder(db,'buyer',params()),c.createOrder(db,'buyer',params())]);assert.equal(a.orderId,b.orderId);assert.equal(a.totalAmount,1000);assert.equal(a.payAmount,500);assert.equal(db.snapshot().users[0].balance,0);assert.equal(db.snapshot().balance_transactions.length,1);await assert.rejects(c.createOrder(db,'buyer',{...params(),items:[{skuId:'s',count:2}]}),{code:'IDEMPOTENCY_CONFLICT'});});
test('missing idempotency key and fractional amount rejected',async()=>{const db=fixture();await assert.rejects(c.createOrder(db,'buyer',{...params(),requestId:undefined}),{code:'INVALID_PARAMS'});await db.collection('product_skus').doc('s').update({data:{price:1.5}});await assert.rejects(c.createOrder(db,'buyer',params()),{code:'INVALID_PARAMS'});});
test('cart ownership failure rolls back order and balance',async()=>{const db=fixture(500);await assert.rejects(c.createOrder(db,'buyer',{...params(),items:[{skuId:'s',count:1,cartId:'cart'}]}),{code:'PERMISSION_DENIED'});assert.equal(db.snapshot().orders?.length||0,0);assert.equal(db.snapshot().users[0].balance,500);assert.equal(db.snapshot().carts.length,1);});
test('payment amount/buyer rejection and duplicate callback',async()=>{const db=fixture();const r=await c.createOrder(db,'buyer',params()),e={orderId:r.orderId,totalFee:1000,openid:'buyer',transactionId:'TX',isTest:true};await assert.rejects(c.confirmPayment(db,{...e,totalFee:1}),{code:'AMOUNT_MISMATCH'});await assert.rejects(c.confirmPayment(db,{...e,openid:'other'}),{code:'BUYER_MISMATCH'});await Promise.all([c.confirmPayment(db,e),c.confirmPayment(db,e)]);assert.equal(db.snapshot().payment_transactions.length,1);assert.equal(db.snapshot().products[0].sales,1);});
test('write failure rolls back payment state, sales and ledger',async()=>{const db=fixture();const r=await c.createOrder(db,'buyer',params());db.injectFailure((collection)=>collection==='payment_transactions');await assert.rejects(c.confirmPayment(db,{orderId:r.orderId,totalFee:1000,openid:'buyer',transactionId:'TX',isTest:true}));assert.equal((await c.get(db,'orders',r.orderId)).status,'PENDING_PAYMENT');assert.equal(db.snapshot().products[0].sales,0);});
test('cancel is idempotent and returns balance once',async()=>{const db=fixture(500);const r=await c.createOrder(db,'buyer',params());await assert.rejects(c.cancelOrder(db,{},r.orderId,'other'),{code:'ORDER_NOT_FOUND'});await Promise.all([c.cancelOrder(db,{},r.orderId,'buyer'),c.cancelOrder(db,{},r.orderId,'buyer')]);assert.equal(db.snapshot().users[0].balance,500);assert.equal(db.snapshot().balance_transactions.length,2);});
test('prepay lease excludes cancellation and duplicate prepay',async()=>{const db=fixture();const r=await c.createOrder(db,'buyer',params());await c.beginPayment(db,r.orderId,'buyer');await assert.rejects(c.cancelOrder(db,{},r.orderId,'buyer'),{code:'PAYMENT_BUSY'});await assert.rejects(c.beginPayment(db,r.orderId,'buyer'),{code:'PAYMENT_BUSY'});});
test('refund evidence required and cash/balance only returned once',async()=>{const db=fixture(500),o=await paid(db);await c.applyRefund(db,o._id,'buyer','不要了');const r=await c.beginRefund(db,o._id,'');await assert.rejects(c.finishRefund(db,r.refundNo),{code:'REFUND_EVIDENCE_INVALID'});const e={internal:true,status:'SUCCESS',out_refund_no:r.refundNo,out_trade_no:o.orderNo,amount:{total:500,refund:500,currency:'CNY'}};await assert.rejects(c.finishRefund(db,r.refundNo,{...e,amount:{...e.amount,refund:1000}}),{code:'REFUND_EVIDENCE_INVALID'});await Promise.all([c.finishRefund(db,r.refundNo,e),c.finishRefund(db,r.refundNo,e)]);assert.equal(db.snapshot().users[0].balance,500);assert.equal(db.snapshot().products[0].sales,0);});
test('shipped refund requires confirmed return, rejection preserves state',async()=>{const db=fixture(),o=await paid(db);await db.collection('orders').doc(o._id).update({data:{status:'SHIPPED'}});await c.applyRefund(db,o._id,'buyer','退货');await assert.rejects(c.beginRefund(db,o._id,''),{code:'RETURN_REQUIRED'});await c.rejectRefund(db,o._id,'等待退货');assert.equal((await c.get(db,'orders',o._id)).status,'SHIPPED');});
test('only active SUPER_ADMIN credentials and environment secret accepted',async()=>{process.env.ADMIN_JWT_SECRET='x'.repeat(40);const {createToken,permissionVersion}=require('../../cloudfunctions/common/crypto');const {requireAdmin}=require('../../cloudfunctions/common/authMiddleware');const db=createDb({admins:[{_id:'a',role:'MERCHANT',status:'ACTIVE',permissions:['*']}]});const a=await c.get(db,'admins','a');const token=createToken({adminId:'a',version:permissionVersion(a)});await assert.rejects(requireAdmin({token},db),{code:'ADMIN_REQUIRED'});delete process.env.ADMIN_JWT_SECRET;await assert.rejects(requireAdmin({token,adminJwtSecret:'x'.repeat(40)},db));assert.equal(process.env.ADMIN_JWT_SECRET,undefined);});
test('raw signature and AES-GCM notification verified, tampering rejected',()=>{const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});Object.assign(process.env,{WECHAT_APP_ID:'wx-test',WECHAT_PAY_MCH_ID:'123',WECHAT_PAY_SERIAL_NO:'mch-serial',WECHAT_PAY_PRIVATE_KEY:privateKey,WECHAT_PAY_API_V3_KEY:'k'.repeat(32),WECHAT_PAY_PLATFORM_KEYS_JSON:JSON.stringify({'key-id':publicKey})});const g=require('../../cloudfunctions/common/payGateway'),nonce='123456789012',aad='transaction',cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from('k'.repeat(32)),Buffer.from(nonce));cipher.setAAD(Buffer.from(aad));const ciphertext=Buffer.concat([cipher.update(JSON.stringify({out_trade_no:'order'})),cipher.final(),cipher.getAuthTag()]).toString('base64');const body=JSON.stringify({id:'event',event_type:'TRANSACTION.SUCCESS',resource:{algorithm:'AEAD_AES_256_GCM',nonce,associated_data:aad,ciphertext}}),timestamp=String(Math.floor(Date.now()/1000)),headers={'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':'nonce','Wechatpay-Serial':'key-id','Wechatpay-Signature':crypto.sign('RSA-SHA256',Buffer.from(`${timestamp}\nnonce\n${body}\n`),privateKey).toString('base64')};assert.equal(g.decryptNotification({body,headers}).data.out_trade_no,'order');assert.throws(()=>g.decryptNotification({body:body+' ',headers}),{code:'SIGNATURE_INVALID'});assert.throws(()=>g.decryptNotification({body,headers:{...headers,'Wechatpay-Serial':'unknown'}}),{code:'SIGNATURE_INVALID'});});

test('per-unit split preserves freight, cash and balance exactly with one debit',async()=>{
  const db=fixture(1400),settings=require('../../cloudfunctions/common/storeSettings');
  await db.collection('store_settings').doc(settings.ID).set({data:settings.validate({mallName:'水果',shippingRules:[{province:'广东',city:'',district:'',deliverable:true,firstFee:101,additionalFee:2}]})});
  const p={...params(),items:[{skuId:'s',count:3}]},quote=await c.quoteOrder(db,'buyer',p),result=await c.createOrder(db,'buyer',{...p,quoteKey:quote.quoteKey});
  assert.equal(result.orderIds.length,3);assert.equal(quote.shippingFee,105);
  const children=await Promise.all(result.orderIds.map(id=>c.get(db,'orders',id)));
  for(const field of ['totalAmount','payAmount','balanceAmount','shippingFee'])assert.equal(children.reduce((sum,x)=>sum+x[field],0),result[field]);
  assert.ok(children.every(x=>x.items.length===1&&x.items[0].count===1&&x.groupId===result.orderId));
  const evidence={orderId:result.orderId,totalFee:result.payAmount,openid:'buyer',transactionId:'SPLIT_TX',isTest:true};
  await Promise.all([c.confirmPayment(db,evidence),c.confirmPayment(db,evidence)]);
  assert.equal(db.snapshot().payment_transactions.length,1);assert.equal(db.snapshot().products[0].sales,3);
  assert.ok(result.orderIds.every(id=>db.snapshot().orders.find(x=>x._id===id).shipDeadlineAt));
  assert.equal(db.snapshot().balance_transactions.length,1);
});
test('cancelling one unpaid child cancels the entire batch and returns balance once',async()=>{
  const db=fixture(1700),r=await c.createOrder(db,'buyer',{...params(),items:[{skuId:'s',count:2}]});
  await Promise.all(r.orderIds.map(id=>c.cancelOrder(db,{},id,'buyer')));
  assert.ok(db.snapshot().orders.every(o=>o.status==='CANCELLED'));
  assert.equal(db.snapshot().users[0].balance,1700);assert.equal(db.snapshot().balance_transactions.length,2);
});
test('one child refund uses the original transaction total and leaves its sibling paid',async()=>{
  const db=fixture(500),r=await c.createOrder(db,'buyer',{...params(),items:[{skuId:'s',count:2}]});
  await c.confirmPayment(db,{orderId:r.orderId,totalFee:1500,openid:'buyer',transactionId:'BATCH_TX',isTest:true});
  const child=await c.get(db,'orders',r.orderIds[0]);
  await c.applyRefund(db,child._id,'buyer','坏果');const current=await c.beginRefund(db,child._id,'');
  const refund=await c.get(db,'refund_records',current.refundNo);
  assert.equal(refund.totalFee,1500);assert.equal(refund.refundFee,500);
  const e={internal:true,status:'SUCCESS',out_refund_no:refund._id,out_trade_no:child.paymentOrderNo,amount:{total:1500,refund:500,currency:'CNY'}};
  await assert.rejects(c.finishRefund(db,refund._id,{...e,out_trade_no:child.orderNo}),{code:'REFUND_EVIDENCE_INVALID'});
  await Promise.all([c.finishRefund(db,refund._id,e),c.finishRefund(db,refund._id,e)]);
  assert.equal((await c.get(db,'orders',r.orderIds[1])).status,'PAID');assert.equal(db.snapshot().products[0].sales,1);
  assert.equal(db.snapshot().users[0].balance,500);
});
test('received quality aftersales requires explicit request and recorded return waiver',async()=>{
  const db=fixture(),o=await paid(db);await db.collection('orders').doc(o._id).update({data:{status:'COMPLETED'}});
  await assert.rejects(c.applyRefund(db,o._id,'buyer','无理由'),{code:'INVALID_ORDER_STATUS'});
  await c.applyRefund(db,o._id,'buyer','发现坏果',true);
  await assert.rejects(c.beginRefund(db,o._id,''),{code:'RETURN_REQUIRED'});
  await assert.rejects(c.beginRefund(db,o._id,'',false,{waiveReturn:true,adminId:'a',reason:'短'}),{code:'INVALID_PARAMS'});
  const r=await c.beginRefund(db,o._id,'',false,{waiveReturn:true,adminId:'a',reason:'已核实坏果免退回'});
  const record=await c.get(db,'refund_records',r.refundNo);
  assert.equal(record.returnReceived,false);assert.equal(record.returnWaiver.adminId,'a');
  assert.equal(db.snapshot().operation_logs[0].action,'WAIVE_RETURN');
});
test('delivery rules prefer district and reject unsupported destinations and duplicate areas',()=>{
  const settings=require('../../cloudfunctions/common/storeSettings'),base={mallName:'果店',shippingRules:[{province:'',city:'',district:'',deliverable:true,firstFee:400,additionalFee:100},{province:'广东',city:'深圳',district:'南山',deliverable:false,firstFee:0,additionalFee:0}]};
  const s=settings.validate(base);assert.throws(()=>settings.freight(s,address,1),{code:'DELIVERY_UNAVAILABLE'});
  assert.equal(settings.freight(s,{...address,district:'福田'},2).amount,500);
  assert.throws(()=>settings.validate({...base,shippingRules:[base.shippingRules[0],base.shippingRules[0]]}),{code:'INVALID_PARAMS'});
  assert.throws(()=>settings.validate({...base,shippingRules:[{...base.shippingRules[0],firstFee:1.2}]}),{code:'INVALID_PARAMS'});
  assert.throws(()=>settings.validate({...base,shippingRules:[{...base.shippingRules[0],province:'',city:'深圳'}]}),{code:'INVALID_PARAMS'});
});
test('quote change rejects before debiting or consuming a cart; replay returns original batch',async()=>{
  const db=fixture(500),p={...params(),items:[{skuId:'s',count:2}]},quote=await c.quoteOrder(db,'buyer',p);
  await db.collection('product_skus').doc('s').update({data:{price:1200}});
  await assert.rejects(c.createOrder(db,'buyer',{...p,quoteKey:quote.quoteKey}),{code:'QUOTE_CHANGED'});
  assert.equal(db.snapshot().orders?.length||0,0);assert.equal(db.snapshot().users[0].balance,500);
  const q=await c.quoteOrder(db,'buyer',p),r=await c.createOrder(db,'buyer',{...p,quoteKey:q.quoteKey});
  await db.collection('products').doc('p').update({data:{status:'OFF_SALE'}});
  assert.deepEqual(await c.createOrder(db,'buyer',{...p,quoteKey:q.quoteKey}),r);
});
test('split transaction write failure rolls back every child and the debit',async()=>{
  const db=fixture(500);db.injectFailure(n=>n==='balance_transactions');
  await assert.rejects(c.createOrder(db,'buyer',{...params(),items:[{skuId:'s',count:2}]}));
  assert.equal(db.snapshot().orders?.length||0,0);assert.equal(db.snapshot().users[0].balance,500);
});
test('refund returns reserved credit even when current balance reached issuance limit',async()=>{
  const db=fixture(500),o=await paid(db);await db.collection('users').doc('u').update({data:{balance:100000000}});
  await c.applyRefund(db,o._id,'buyer','坏果');const r=await c.beginRefund(db,o._id,'');
  await c.finishRefund(db,r.refundNo,{internal:true,status:'SUCCESS',out_refund_no:r.refundNo,out_trade_no:o.orderNo,amount:{total:500,refund:500,currency:'CNY'}});
  assert.equal(db.snapshot().users[0].balance,100000500);
});
test('refund recovery queries original number before resubmission and reserves partial refund spacing',async()=>{
  const db=fixture(),r=await c.createOrder(db,'buyer',{...params(),items:[{skuId:'s',count:2}]});
  await c.confirmPayment(db,{orderId:r.orderId,totalFee:2000,openid:'buyer',transactionId:'RECOVER_TX',isTest:true});
  await db.collection('orders').doc(r.orderId).update({data:{isTest:false}});
  for(const id of r.orderIds){await db.collection('orders').doc(id).update({data:{isTest:false}});await c.applyRefund(db,id,'buyer','质量售后');await c.beginRefund(db,id,'');}
  const gateway=require('../../cloudfunctions/common/payGateway'),service=require('../../cloudfunctions/common/refundService'),original={query:gateway.queryRefund,create:gateway.createRefund};let calls=[];
  gateway.queryRefund=async no=>{calls.push('query:'+no);throw c.error('RESOURCE_NOT_EXISTS','not created');};
  gateway.createRefund=async(o,f)=>{calls.push('create:'+f._id);return {status:'PROCESSING'};};
  try{
    const f=await c.get(db,'refund_records',(await c.get(db,'orders',r.orderIds[0])).refundNo);
    await service.reconcile(db,f);await service.reconcile(db,f);
    assert.deepEqual(calls,['query:'+f._id,'create:'+f._id,'query:'+f._id,'create:'+f._id]);
    const sibling=await c.get(db,'refund_records',(await c.get(db,'orders',r.orderIds[1])).refundNo);
    await assert.rejects(service.reconcile(db,sibling),{code:'REFUND_BUSY'});assert.equal(calls.length,5);
    gateway.queryRefund=async()=>({status:'ABNORMAL'});const result=await service.reconcile(db,f);
    assert.equal(result.requiresAction,true);assert.equal((await c.get(db,'orders',r.orderIds[0])).status,'REFUNDING');
  }finally{gateway.queryRefund=original.query;gateway.createRefund=original.create;}
});

test('shipping deadline uses verified payment time rather than delayed notification time',async()=>{
  const db=fixture(),r=await c.createOrder(db,'buyer',{...params(),items:[{skuId:'s',count:2}]}),paidAt=new Date(Date.now()-12*3600000).toISOString();
  await c.confirmPayment(db,{orderId:r.orderId,totalFee:2000,openid:'buyer',transactionId:'DELAYED_TX',isTest:true,paidAt});
  for(const id of r.orderIds){const order=await c.get(db,'orders',id);assert.equal(new Date(order.paidAt).getTime(),Date.parse(paidAt));assert.equal(new Date(order.shipDeadlineAt).getTime(),Date.parse(paidAt)+48*3600000);}
});
