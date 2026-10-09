const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database(),c=require('./common/commerce'),{decode}=require('./common/wechatEvent'),{handleMedia}=require('./common/contentSafety');
const reply=(statusCode,body)=>({statusCode,headers:{'Content-Type':'text/plain; charset=utf-8'},body,isBase64Encoded:false});
exports.main=async event=>{try{
  if(cloud.getWXContext().OPENID)throw c.error('FORBIDDEN','仅接受微信 HTTP 消息');
  const decoded=decode(event);if(decoded.echo!==undefined)return reply(200,decoded.echo);
  const message=decoded.data;
  if(message.Event==='wxa_media_check')await handleMedia(db,message);
  const id=c.key(message.Event||message.MsgType,message.trace_id||'',message.CreateTime||'',message.FromUserName||'');
  await db.collection('wechat_events').doc(id).set({data:{type:message.Event||message.MsgType||'unknown',traceId:message.trace_id||'',processedAt:new Date()}});
  return reply(200,'success');
}catch(e){console.error('[wechatEvents]',e.code||'EVENT_FAILED');return reply(500,'retry');}};
