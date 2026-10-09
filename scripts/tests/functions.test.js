const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const {createDb}=require('../lib/local-db'),{loadRuntime}=require('../lib/local-runtime');
const c=require('../../cloudfunctions/common/commerce');
process.env.APP_ENV='test';process.env.PAYMENT_MODE='test';process.env.ADMIN_JWT_SECRET='a'.repeat(40);process.env.ENABLE_TEST_PAYMENTS='true';
const {hashPassword}=require('../../cloudfunctions/common/crypto');
const db=createDb({users:[{_id:'u',_openid:'buyer',balance:0}],products:[{_id:'p',name:'商品',status:'ON_SALE',sales:0}],product_skus:[{_id:'s',productId:'p',status:'ACTIVE',price:1000}],admins:[{_id:'a',username:'superadmin',name:'超管',role:'SUPER_ADMIN',status:'ACTIVE',salt:'salt',passwordHash:hashPassword('long-test-password','salt'),sessionVersion:0}],activation_codes:[{_id:'code',code:'TEST-CODE',type:'BALANCE',value:500,status:'UNUSED'}]});
const runtime=loadRuntime(db);let token;
const call=(name,action,params={},buyer=false)=>runtime.call(name,{action,params,token,headers:{authorization:'Bearer '+token}},buyer?{OPENID:'buyer'}:{});
const input=()=>({requestId:'entry-request-'+crypto.randomUUID(),shippingAddress:{name:'测试',phone:'13800138000',province:'广东',city:'深圳',district:'南山',detail:'测试地址'},items:[{skuId:'s',count:1}],useBalance:false});
test('production handlers require identity and only SUPER_ADMIN login',async()=>{
  assert.equal((await call('orders','create',input())).code,'AUTH_REQUIRED');
  const login=await call('adminAuth','login',{username:'superadmin',password:'long-test-password'});assert.equal(login.success,true);token=login.data.token;
  await db.collection('admins').doc('m').set({data:{username:'old-merchant',role:'MERCHANT',status:'ACTIVE',salt:'salt',passwordHash:hashPassword('long-test-password','salt')}});
  assert.equal((await call('adminAuth','login',{username:'old-merchant',password:'long-test-password'})).code,'AUTH_FAILED');
  assert.equal((await call('adminUsers','create',{username:'bad',password:'long-test-password',role:'MERCHANT'})).code,'INVALID_PARAMS');
});
test('buyer order endpoints list/detail use orders and enforce ownership',async()=>{
  const create=await call('orders','create',input(),true);assert.equal(create.success,true);const id=create.data.orderId;
  assert.equal((await call('orders','detail',{id},true)).data._id,id);
  const other=await runtime.call('orders',{action:'detail',params:{id}},{OPENID:'other'});assert.equal(other.code,'ORDER_NOT_FOUND');
  assert.equal((await call('orders','list',{},true)).data.list.some(o=>o._id===id),true);
  assert.equal((await call('orders','cancel',{id},true)).data.status,'CANCELLED');
});
test('test payment, admin shipping, buyer receipt and refund entry contracts',async()=>{
  const create=await call('orders','create',input(),true),id=create.data.orderId;
  assert.equal((await call('testPayment','pay',{orderId:id})).success,true);
  assert.equal((await call('adminOrders','ship',{orderId:id,trackingNo:'SF123456789',logisticsCompany:'SF'})).success,true);
  assert.equal((await call('orders','confirmReceive',{id},true)).data.status,'COMPLETED');
  assert.equal((await call('orders','applyRefund',{id,reason:'退货'},true)).code,'INVALID_ORDER_STATUS');
});
test('activation is transactional and redemption cannot issue duplicate credit',async()=>{
  const [a,b]=await Promise.all([call('activation','redeem',{code:'TEST-CODE'},true),call('activation','redeem',{code:'TEST-CODE'},true)]);
  assert.equal([a,b].filter(r=>r.success).length,1);assert.equal(db.snapshot().users[0].balance,500);
  assert.equal(db.snapshot().balance_transactions.filter(r=>r.businessKey==='ACTIVATION:code').length,1);
  assert.equal((await runtime.call('ads',{action:'reward',params:{}},{OPENID:'buyer'})).code,'AD_DISABLED');
});
test('no last-admin/self disable, changed session invalidates token',async()=>{
  assert.equal((await call('adminUsers','toggleStatus',{id:'a',status:'DISABLED'})).code,'FORBIDDEN');
  assert.equal((await call('adminAuth','logout')).success,true);
  assert.equal((await call('adminOrders','list')).code,'AUTH_REQUIRED');
  token=(await call('adminAuth','login',{username:'superadmin',password:'long-test-password'})).data.token;
});
test('official shipping request identity and explicit received states',async()=>{
  const ship=require('../../cloudfunctions/common/wxOrderShippingService');process.env.WECHAT_PAY_MCH_ID='123';
  const create=await call('orders','create',input(),true),id=create.data.orderId;
  await db.collection('orders').doc(id).update({data:{isTest:false,status:'SHIPPED',payAmount:1000}});
  let state=5,payload;
  const cloud={openapi:{wxa:{sec:{order:{getOrder:async p=>{payload=p;return {errcode:0,order:{order_state:state}};}}}}}};
  await ship.reconcileOrderWithWechat(cloud,db,await c.get(db,'orders',id));assert.deepEqual(payload,{merchant_id:'123',merchant_trade_no:create.data.orderNo});
  assert.equal((await c.get(db,'orders',id)).status,'SHIPPED');
  state=6;await ship.reconcileOrderWithWechat(cloud,db,await c.get(db,'orders',id));assert.equal((await c.get(db,'orders',id)).status,'SHIPPED');
  state=3;await ship.reconcileOrderWithWechat(cloud,db,await c.get(db,'orders',id));assert.equal((await c.get(db,'orders',id)).status,'COMPLETED');
});
test('content callback cannot approve obsolete revision or partially reviewed assets',async()=>{
  const {handleMedia}=require('../../cloudfunctions/common/contentSafety');
  await db.collection('products').doc('p').update({data:{contentSafety:{version:'current',status:'PENDING'}}});
  for(const [id,version,traceId]of [['r1','current','t1'],['r2','current','t2'],['old','obsolete','oldtrace']])await db.collection('content_reviews').doc(id).set({data:{entityType:'PRODUCT',entityId:'p',version,traceId,status:'PENDING'}});
  await handleMedia(db,{trace_id:'oldtrace',result:{suggest:'pass'}});assert.equal((await c.get(db,'products','p')).contentSafety.status,'PENDING');
  await handleMedia(db,{trace_id:'t1',result:{suggest:'pass'}});assert.equal((await c.get(db,'products','p')).contentSafety.status,'PENDING');
  await handleMedia(db,{trace_id:'t2',result:{suggest:'risky'}});assert.equal((await c.get(db,'products','p')).contentSafety.status,'REVIEW_REQUIRED');
});
test('WeChat safe JSON message AES payload app identity and signature',()=>{
  const {decode,signature}=require('../../cloudfunctions/common/wechatEvent');process.env.WECHAT_EVENT_TOKEN='event-token';const key=crypto.randomBytes(32);process.env.WECHAT_EVENT_AES_KEY=key.toString('base64').replace(/=$/,'');process.env.WECHAT_APP_ID='wx-test';
  const plain=Buffer.from(JSON.stringify({Event:'wxa_media_check',trace_id:'t'})),length=Buffer.alloc(4);length.writeUInt32BE(plain.length);
  const raw=Buffer.concat([crypto.randomBytes(16),length,plain,Buffer.from('wx-test')]),pad=32-raw.length%32,cipher=crypto.createCipheriv('aes-256-cbc',key,key.subarray(0,16));cipher.setAutoPadding(false);
  const encrypted=Buffer.concat([cipher.update(Buffer.concat([raw,Buffer.alloc(pad,pad)])),cipher.final()]).toString('base64'),timestamp=String(Math.floor(Date.now()/1000)),q={timestamp,nonce:'n',encrypt_type:'aes',msg_signature:signature(['event-token',timestamp,'n',encrypted])};
  assert.equal(decode({httpMethod:'POST',body:JSON.stringify({Encrypt:encrypted}),queryStringParameters:q}).data.trace_id,'t');
  assert.throws(()=>decode({httpMethod:'POST',body:JSON.stringify({Encrypt:encrypted}),queryStringParameters:{...q,msg_signature:'0'.repeat(40)}}),{code:'SIGNATURE_INVALID'});
});
test('retired actions and unauthenticated diagnostic gateway cannot mutate data',async()=>{
  for(const action of ['preparePickup','completePickup','shipSubOrder'])assert.equal((await call('adminOrders',action,{orderId:db.snapshot().orders[0]._id})).code,'ACTION_NOT_FOUND');
  const res=await runtime.call('adminGateway',{httpMethod:'POST',path:'/diagnose',body:'{}'});assert.equal(res.statusCode,404);
});
function notification(type,data,id='evt'){
  const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  Object.assign(process.env,{WECHAT_APP_ID:'wx-test',WECHAT_PAY_MCH_ID:'123',WECHAT_PAY_SERIAL_NO:'mch-serial',WECHAT_PAY_PRIVATE_KEY:pair.privateKey,WECHAT_PAY_API_V3_KEY:'k'.repeat(32),WECHAT_PAY_PLATFORM_KEYS_JSON:JSON.stringify({'platform-id':pair.publicKey})});
  const nonce='123456789012',cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from('k'.repeat(32)),Buffer.from(nonce));cipher.setAAD(Buffer.from('resource'));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final(),cipher.getAuthTag()]).toString('base64'),body=JSON.stringify({id,event_type:type,resource:{algorithm:'AEAD_AES_256_GCM',nonce,associated_data:'resource',ciphertext}}),timestamp=String(Math.floor(Date.now()/1000));
  return {httpMethod:'POST',body,headers:{'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':'n','Wechatpay-Serial':'platform-id','Wechatpay-Signature':crypto.sign('RSA-SHA256',Buffer.from(`${timestamp}\nn\n${body}\n`),pair.privateKey).toString('base64')}};
}
test('HTTP payment callback ACK follows durable transaction, failures can retry safely',async()=>{
  const r=await call('orders','create',input(),true),id=r.data.orderId;
  await db.collection('orders').doc(id).update({data:{isTest:false}});
  const data={appid:'wx-test',mchid:'123',out_trade_no:r.data.orderNo,trade_state:'SUCCESS',transaction_id:'REAL_TEST_TX',amount:{total:1000,currency:'CNY'},payer:{openid:'buyer'}},event=notification('TRANSACTION.SUCCESS',data,'pay-evt');
  db.injectFailure(name=>name==='payment_transactions');const failed=await runtime.call('paymentCallback',event);assert.equal(failed.statusCode,500);assert.equal((await c.get(db,'orders',id)).status,'PENDING_PAYMENT');
  db.injectFailure(null);assert.equal((await runtime.call('paymentCallback',event)).statusCode,200);assert.equal((await runtime.call('paymentCallback',event)).statusCode,200);
  assert.equal(db.snapshot().payment_transactions.filter(t=>t.transactionId==='REAL_TEST_TX').length,1);
  const wrong=notification('TRANSACTION.SUCCESS',{...data,amount:{total:1,currency:'CNY'}},'bad-pay');assert.equal((await runtime.call('paymentCallback',wrong)).statusCode,500);
});
test('HTTP refund callback verifies cash amount before returning balance and final status',async()=>{
  const order=db.snapshot().orders.find(o=>o.paymentTradeNo==='REAL_TEST_TX');await c.applyRefund(db,order._id,'buyer','退款');const r=await c.beginRefund(db,order._id,'');
  const data={mchid:'123',out_trade_no:r.orderNo,transaction_id:'REAL_TEST_TX',out_refund_no:r.refundNo,refund_id:'WX_REFUND',refund_status:'SUCCESS',amount:{refund:1000,total:1000,currency:'CNY'}};
  const wrong=notification('REFUND.SUCCESS',{...data,amount:{refund:2000,total:1000,currency:'CNY'}},'refund-bad');assert.equal((await runtime.call('refundCallback',wrong)).statusCode,500);assert.equal((await c.get(db,'orders',order._id)).status,'REFUNDING');
  const event=notification('REFUND.SUCCESS',data,'refund-evt');assert.equal((await runtime.call('refundCallback',event)).statusCode,200);assert.equal((await runtime.call('refundCallback',event)).statusCode,200);assert.equal((await c.get(db,'orders',order._id)).status,'REFUNDED');
});
test('media queue prepares all assets atomically and only all passing callbacks release product',async()=>{
  const {reviewAssets,processPending,handleMedia}=require('../../cloudfunctions/common/contentSafety'),queueDb=createDb({products:[{_id:'product',status:'OFF_SALE',contentSafety:{version:'v',status:'PENDING'}}]});
  const cloud={openapi:{security:{mediaCheckAsync:async payload=>({errcode:0,trace_id:payload.media_url})}}};process.env.CONTENT_SECURITY_OPENID='recent-admin-openid';
  await reviewAssets(cloud,queueDb,'PRODUCT','product','v',['https://example.com/a.jpg','https://example.com/b.jpg'],'recent-admin-openid');
  assert.equal(queueDb.snapshot().content_reviews.length,2);
  await processPending(cloud,queueDb,1);await handleMedia(queueDb,{trace_id:'https://example.com/a.jpg',result:{suggest:'pass'}});assert.equal((await c.get(queueDb,'products','product')).contentSafety.status,'PENDING');
  await processPending(cloud,queueDb,1);await handleMedia(queueDb,{trace_id:'https://example.com/b.jpg',result:{suggest:'pass'}});assert.equal((await c.get(queueDb,'products','product')).contentSafety.status,'PASS');
  assert.equal((await c.get(queueDb,'products','product')).status,'OFF_SALE');
});

test('profile update validates text and queues avatar without publishing it',async()=>{
  runtime.cloud.openapi={security:{msgSecCheck:async()=>({errcode:0,result:{suggest:'pass'}})}};
  const r=await call('auth','updateProfile',{nickName:'新昵称',avatarUrl:'https://example.com/avatar.jpg'},true);
  assert.equal(r.success,true);assert.equal(r.data.user.nickName,'新昵称');assert.notEqual(r.data.user.avatarUrl,'https://example.com/avatar.jpg');
  assert.equal(db.snapshot().content_reviews.some(r=>r.entityType==='PROFILE'&&r.entityId==='u'),true);
  delete runtime.cloud.openapi;
});
test('concurrent first logins create one user and ignore client-assigned user number',async()=>{
  const results=await Promise.all([runtime.call('auth',{action:'login',params:{userNo:'FORGED'}},{OPENID:'new-buyer'}),runtime.call('auth',{action:'login',params:{}},{OPENID:'new-buyer'})]);
  assert.equal(results.every(r=>r.success),true);assert.equal(db.snapshot().users.filter(u=>u._openid==='new-buyer').length,1);assert.notEqual(results[0].data.user.userNo,'FORGED');
});
test('address ownership and transactional default pointer survive failures',async()=>{
  const address={name:'收货人',phone:'13800138000',province:'广东',city:'深圳',district:'南山',detail:'真实地址'};
  const created=await call('addresses','save',address,true);assert.equal(created.success,true);const id=created.data.id;
  assert.equal((await runtime.call('addresses',{action:'save',params:{...address,id}},{OPENID:'other'})).code,'PERMISSION_DENIED');
  assert.equal((await call('addresses','save',{...address,id:'missing'},true)).code,'ADDRESS_NOT_FOUND');
  assert.equal((await call('addresses','save',{...address,district:''},true)).success,false);
  db.injectFailure(n=>n==='address_meta');const failed=await call('addresses','save',{...address,isDefault:true},true);db.injectFailure(null);
  assert.equal(failed.success,false);assert.equal(db.snapshot().addresses.length,1);assert.equal((await c.get(db,'address_meta','buyer')).defaultAddressId,id);
  assert.equal((await call('addresses','delete',{id},true)).success,true);assert.equal((await c.get(db,'address_meta','buyer')).defaultAddressId,null);
});
test('cart concurrent adds and clear failures do not lose updates or report success',async()=>{
  const results=await Promise.all([call('cart','addCart',{skuId:'s',count:1},true),call('cart','addCart',{skuId:'s',count:1},true)]);
  assert.equal(results.every(r=>r.success),true);const row=db.snapshot().carts.find(r=>r.userId==='buyer'&&r.skuId==='s');assert.equal(row.count,2);
  db.injectFailure(n=>n==='carts');assert.equal((await call('cart','clearSelected',{},true)).success,false);db.injectFailure(null);assert.equal((await c.get(db,'carts',row._id)).count,2);
});

test('banner and category edits are reviewed, protected fields and hierarchy cannot bypass checks',async()=>{
  const safety=require('../../cloudfunctions/common/contentSafety');process.env.CONTENT_SECURITY_OPENID='buyer';runtime.cloud.openapi={security:{msgSecCheck:async()=>({errcode:0,result:{suggest:'pass'}}),mediaCheckAsync:async p=>({errcode:0,traceId:p.media_url})}};
  const b=await call('adminBanners','create',{title:'轮播',imageUrl:'https://example.com/banner.jpg',contentSafety:{status:'PASS'}});assert.equal(b.success,true);assert.equal((await c.get(db,'banners',b.data.bannerId)).status,'REVIEWING');
  assert.equal((await call('products','banners')).data.some(r=>r._id===b.data.bannerId),false);
  await safety.processPending(runtime.cloud,db,100);await safety.handleMedia(db,{trace_id:'https://example.com/banner.jpg',result:{suggest:'pass'}});
  assert.equal((await c.get(db,'banners',b.data.bannerId)).status,'ACTIVE');
  const category=await call('adminCategories','create',{name:'分类',icon:'🍎'});assert.equal(category.success,true);
  const child=await call('adminCategories','create',{name:'子类',icon:'🍎',parentId:category.data.categoryId});assert.equal(child.success,true);
  assert.equal((await call('adminCategories','update',{id:category.data.categoryId,parentId:child.data.categoryId})).success,false);
  assert.equal((await call('adminCategories','create',{name:'三级',icon:'🍎',parentId:child.data.categoryId})).success,false);
  delete runtime.cloud.openapi;
});
test('editing product details preserves SKU identities and matrix',async()=>{
  runtime.cloud.openapi={security:{msgSecCheck:async()=>({errcode:0,result:{suggest:'pass'}})}};process.env.CONTENT_SECURITY_OPENID='buyer';
  await db.collection('product_skus').doc('s').update({data:{colorName:'默认',size:1,colorImage:'https://example.com/p.jpg'}});await db.collection('products').doc('p').update({data:{cover:'https://example.com/p.jpg',minPrice:1000,maxPrice:1000}});
  await db.collection('product_skus').doc('s-matrix').set({data:{productId:'p',status:'ACTIVE',colorName:'另一配色',size:2,price:1500,colorImage:'https://example.com/p.jpg'}});
  const r=await call('adminProducts','update',{id:'p',name:'更新商品',minPrice:1200});assert.equal(r.success,true);
  const sku=await c.get(db,'product_skus','s');assert.equal(sku.status,'ACTIVE');assert.equal(sku.price,1200);
  assert.equal(db.snapshot().product_skus.filter(s=>s.productId==='p'&&s.status==='ACTIVE').length,2);assert.equal((await c.get(db,'product_skus','s-matrix')).price,1200);
  assert.equal((await call('adminProducts','reseedDefaultSkus')).code,'ACTION_NOT_FOUND');delete runtime.cloud.openapi;
});

test('checkout immediate purchase omits synthetic cart id and never removes cart twice',async()=>{
  const {OrderService}=require('../../miniprogram/services/order.service'),{CartService}=require('../../miniprogram/services/cart.service');
  const previous={Page:global.Page,wx:global.wx,timeout:global.setTimeout,create:OrderService.createOrder,pay:OrderService.payOrder,remove:CartService.removeItem};let definition,payload,removed=false;
  global.Page=p=>{definition=p;};global.wx={showLoading(){},hideLoading(){},showToast(){},removeStorageSync(){},redirectTo(){}};global.setTimeout=fn=>{fn();return 0;};
  try{
    delete require.cache[require.resolve('../../miniprogram/pages/checkout/index.js')];require('../../miniprogram/pages/checkout/index.js');
    OrderService.createOrder=async p=>{payload=p;return {orderId:'created'};};OrderService.payOrder=async()=>({status:'PENDING_PAYMENT'});CartService.removeItem=async()=>{removed=true;};
    const page={...definition,data:{...definition.data,items:[{id:'buy_123',cartId:'',skuId:'s',count:1}],requestId:'checkout-review-test',selectedAddress:{id:'addr',name:'买家',phone:'13800138000',province:'广东',city:'深圳',district:'南山',detail:'测试地址'},selectedAddressId:'addr'},setData(p){Object.assign(this.data,p);}};
    await page.submitOrder();assert.equal(payload.items[0].cartId,undefined);assert.equal(removed,false);
    page.data.items=[{id:'real-cart',cartId:'real-cart',skuId:'s',count:1}];await page.submitOrder();assert.equal(payload.items[0].cartId,'real-cart');assert.equal(removed,false);
  }finally{global.Page=previous.Page;global.wx=previous.wx;global.setTimeout=previous.timeout;OrderService.createOrder=previous.create;OrderService.payOrder=previous.pay;CartService.removeItem=previous.remove;}
});
test('gateway accepts base64 JSON and production origin has no implicit domain trust',async()=>{
  const event={httpMethod:'POST',path:'/adminGateway/adminUsers',body:Buffer.from(JSON.stringify({action:'list'})).toString('base64'),isBase64Encoded:true,headers:{authorization:'Bearer '+token}};
  assert.equal((await runtime.call('adminGateway',event)).statusCode,200);
  const old=process.env.APP_ENV;process.env.APP_ENV='production';try{assert.equal((await runtime.call('adminGateway',{...event,headers:{...event.headers,origin:'https://unrelated.tcloudbase.com'}})).statusCode,403);}finally{process.env.APP_ENV=old;}
});

test('database read failure cannot overwrite an address or reset a cart',async()=>{
  const before=db.snapshot();const address={name:'原地址',phone:'13800138000',province:'广东',city:'深圳',district:'南山',detail:'地址'};
  const saved=await call('addresses','save',address,true),id=saved.data.id;const cartId=c.key('buyer','s'),cartBefore=await c.get(db,'carts',cartId);
  db.injectReadFailure(n=>n==='addresses'||n==='carts');try{
    assert.equal((await runtime.call('addresses',{action:'save',params:{...address,id,name:'越权覆盖'}},{OPENID:'other'})).success,false);
    assert.equal((await call('cart','addCart',{skuId:'s',count:1},true)).success,false);
  }finally{db.injectReadFailure(null);}
  assert.equal((await c.get(db,'addresses',id)).name,'原地址');assert.deepEqual(await c.get(db,'carts',cartId),cartBefore);
});
test('buyer summary uses all owned orders and includes intermediate states',async()=>{
  await db.collection('orders').doc('other-summary').set({data:{userId:'other',status:'PAID'}});
  const summary=await call('orders','summary',{},true),owned=db.snapshot().orders.filter(o=>o.userId==='buyer');
  assert.equal(summary.data.ALL,owned.length);assert.equal(summary.data.PENDING_PAYMENT,owned.filter(o=>['PENDING_PAYMENT','CLOSING'].includes(o.status)).length);
});
test('local batch insertion and activation stats match actual entrypoint contracts',async()=>{
  const created=await call('activation','generate',{count:2,value:100,expireAt:new Date(Date.now()+86400000).toISOString()});assert.equal(created.success,true);
  assert.equal(db.snapshot().activation_codes.filter(c=>c.batchId===created.data.batchId).length,2);
  const stats=await call('activation','stats');assert.equal(stats.success,true);assert.equal(stats.data.used+stats.data.expired+stats.data.active,stats.data.total);
});

test('profile UI uploads a cloud avatar only after privacy and keeps failed nickname unchanged',async()=>{
  const {AuthService}=require('../../miniprogram/services/auth.service');const old={Page:global.Page,wx:global.wx,update:AuthService.updateProfile};let definition,sheet,media,modal,submitted;const steps=[];
  global.Page=p=>{definition=p;};global.wx={showActionSheet(p){sheet=p;},requirePrivacyAuthorize(p){steps.push('privacy');p.success();},chooseMedia(p){steps.push('choose');media=p;},cloud:{async uploadFile(){steps.push('upload');return {fileID:'cloud://verified-upload/avatar.jpg'};}},showToast(){},showModal(p){modal=p;}};
  try{
    delete require.cache[require.resolve('../../miniprogram/pages/profile/index.js')];require('../../miniprogram/pages/profile/index.js');
    const page={...definition,data:{...definition.data,userInfo:{avatarUrl:'old-avatar',nickName:'原昵称'}},setData(){throw Error('Must not publish unapproved or failed profile');}};
    AuthService.updateProfile=async p=>{submitted=p;return {nickName:'原昵称'};};page.onTapAvatar();await sheet.success({tapIndex:1});await media.success({tempFiles:[{tempFilePath:'wxfile://temporary.jpg',size:100}]});
    assert.deepEqual(steps,['privacy','choose','upload']);assert.equal(submitted.avatarUrl,'cloud://verified-upload/avatar.jpg');
    AuthService.updateProfile=async()=>{throw Error('CONTENT_REVIEW_REQUIRED');};page.onEditNickname();await modal.success({confirm:true,content:'不通过昵称'});assert.equal(page.data.userInfo.nickName,'原昵称');
  }finally{global.Page=old.Page;global.wx=old.wx;AuthService.updateProfile=old.update;}
});

test('receipt/refund race cannot report completion for a refund-pending order',async()=>{
  await db.collection('orders').doc('receipt-race').set({data:{userId:'buyer',orderNo:'SL_RECEIPT_RACE',status:'SHIPPED',payAmount:1000,isTest:false}});
  runtime.cloud.openapi={wxa:{sec:{order:{getOrder:async()=>{await db.collection('orders').doc('receipt-race').update({data:{status:'REFUND_PENDING'}});return {errcode:0,order:{order_state:3}};}}}}};
  try{const result=await call('orders','confirmReceive',{id:'receipt-race'},true);assert.equal(result.code,'CONFLICT');assert.equal((await c.get(db,'orders','receipt-race')).status,'REFUND_PENDING');}finally{delete runtime.cloud.openapi;}
});
