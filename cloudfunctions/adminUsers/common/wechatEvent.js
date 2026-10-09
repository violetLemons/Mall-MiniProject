const crypto=require('crypto'),{error}=require('./commerce');
function signature(parts){return crypto.createHash('sha1').update(parts.slice().sort().join('')).digest('hex');}
function equals(a,b){return typeof a==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function decode(event){
  const q=event.queryStringParameters||{},token=process.env.WECHAT_EVENT_TOKEN;
  if(!token||!/^\d+$/.test(q.timestamp||'')||Math.abs(Date.now()/1000-Number(q.timestamp))>300||!q.nonce)throw error('SIGNATURE_INVALID','消息签名参数无效');
  if(event.httpMethod==='GET'){
    if(!equals(q.signature,signature([token,q.timestamp,q.nonce])))throw error('SIGNATURE_INVALID','消息验签失败');
    return {echo:String(q.echostr||'')};
  }
  if(event.httpMethod!=='POST'||typeof event.body!=='string'||Buffer.byteLength(event.body)>1048576)throw error('INVALID_PARAMS','消息结构无效');
  const body=JSON.parse(event.isBase64Encoded?Buffer.from(event.body,'base64').toString('utf8'):event.body);
  if(q.encrypt_type!=='aes'||typeof body.Encrypt!=='string'||!equals(q.msg_signature,signature([token,q.timestamp,q.nonce,body.Encrypt])))throw error('SIGNATURE_INVALID','仅接受安全模式 JSON 消息');
  const configured=process.env.WECHAT_EVENT_AES_KEY;if(!configured||configured.length!==43)throw error('CONFIG_ERROR','消息加密密钥未配置');
  const key=Buffer.from(configured+'=','base64'),decipher=crypto.createDecipheriv('aes-256-cbc',key,key.subarray(0,16));decipher.setAutoPadding(false);
  const padded=Buffer.concat([decipher.update(Buffer.from(body.Encrypt,'base64')),decipher.final()]),padding=padded[padded.length-1];
  if(padding<1||padding>32||!padded.subarray(-padding).every(v=>v===padding))throw error('INVALID_PARAMS','消息填充无效');
  const raw=padded.subarray(0,-padding);if(raw.length<20)throw error('INVALID_PARAMS','消息过短');
  const length=raw.readUInt32BE(16),end=20+length;
  if(end>raw.length||raw.subarray(end).toString('utf8')!==process.env.WECHAT_APP_ID)throw error('APPID_MISMATCH','消息 AppID 不匹配');
  return {data:JSON.parse(raw.subarray(20,end).toString('utf8'))};
}
module.exports={decode,signature};
