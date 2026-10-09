const c=require('./commerce'),{call,checkText}=require('./wechat');
const COLLECTIONS={PRODUCT:'products',PROFILE:'users',BANNER:'banners',CATEGORY:'categories'};
async function reviewAssets(cloud,db,type,id,version,assets,openid){
  if(!openid)throw c.error('CONTENT_REVIEW_REQUIRED','未配置内容审核身份');
  const urls=[...new Set(assets.filter(Boolean))];
  if(!COLLECTIONS[type]||urls.length>100)throw c.error('INVALID_PARAMS','审核类型或资源数量无效');
  if(!urls.length)throw c.error('CONTENT_REVIEW_REQUIRED','缺少待审图片');
  // Persist every slot first so an early callback cannot approve a partially scheduled batch.
  await c.transaction(db,async tx=>{ for(const asset of urls)await tx.collection('content_reviews').doc(c.key(type,id,version,asset)).set({data:{entityType:type,entityId:id,version,asset,status:'REQUESTING',createdAt:new Date()}}); });
}
async function processPending(cloud,db,limit=3) {
  const pending=(await db.collection('content_reviews').where({status:'REQUESTING'}).orderBy('createdAt','asc').limit(limit).get()).data;
  const results=[];
  for(const row of pending) {
    const leased=await c.transaction(db,async tx=>{
      const current=await c.get(tx,'content_reviews',row._id);
      if(!current||current.status!=='REQUESTING'||new Date(current.submittingUntil||0).getTime()>Date.now())return false;
      await tx.collection('content_reviews').doc(row._id).update({data:{submittingUntil:new Date(Date.now()+60000)}});return true;
    });
    if(!leased)continue;
    try{
      const collection=COLLECTIONS[row.entityType],entity=await c.get(db,collection,row.entityId);
      if(!entity||entity.contentSafety?.version!==row.version){await db.collection('content_reviews').doc(row._id).update({data:{status:'OBSOLETE'}});continue;}
      const openid=row.entityType==='PROFILE'?entity._openid:process.env.CONTENT_SECURITY_OPENID;
      if(!openid)throw c.error('CONFIG_ERROR','未配置审核身份');
      let url=row.asset;
      if(url.startsWith('cloud://')){const r=await cloud.getTempFileURL({fileList:[url]});url=r.fileList?.[0]?.tempFileURL;}
      if(!url?.startsWith('https://'))throw c.error('INVALID_PARAMS','审核图片必须为 HTTPS');
      const response=await call(cloud,'security.mediaCheckAsync','/wxa/media_check_async',{media_url:url,media_type:2,version:2,scene:row.entityType==='PROFILE'?1:3,openid});
      const traceId=response.trace_id||response.traceId;
      if(!traceId)throw c.error('CONTENT_REVIEW_REQUIRED','审核任务未返回任务号');
      await db.collection('content_reviews').doc(row._id).update({data:{traceId,status:'PENDING',updatedAt:new Date()}});
      results.push({id:row._id,status:'PENDING'});
    }catch(e){await c.transaction(db,async tx=>{await tx.collection('content_reviews').doc(row._id).update({data:{status:'FAILED',updatedAt:new Date()}});const coll=COLLECTIONS[row.entityType],entity=await c.get(tx,coll,row.entityId);if(entity?.contentSafety?.version===row.version)await tx.collection(coll).doc(row.entityId).update({data:{contentSafety:{version:row.version,status:'REVIEW_REQUIRED'}}});});results.push({id:row._id,status:'FAILED',code:e.code||'WECHAT_UNCERTAIN'});}
  }
  return results;
}

async function handleMedia(db,event){
  const trace=event.trace_id||event.TraceId;
  if(!trace)throw c.error('INVALID_PARAMS','缺少审核任务号');
  const row=(await db.collection('content_reviews').where({traceId:trace}).limit(1).get()).data[0];
  if(!row)throw c.error('RETRY_REQUIRED','审核任务尚未绑定');
  const suggest=event.result?.suggest;
  const status=Number(event.errcode||0)===0&&suggest==='pass'?'PASS':'REVIEW_REQUIRED';
  return c.transaction(db,async tx=>{
    const current=await c.get(tx,'content_reviews',row._id);
    if(current.status==='PASS'||current.status==='REVIEW_REQUIRED')return;
    await tx.collection('content_reviews').doc(row._id).update({data:{status,checkedAt:new Date()}});
    const collection=COLLECTIONS[row.entityType],entity=await c.get(tx,collection,row.entityId);
    if(!entity||entity.contentSafety?.version!==row.version)return;
    const records=(await tx.collection('content_reviews').where({entityType:row.entityType,entityId:row.entityId,version:row.version}).get()).data;
    const finalStatus=records.some(r=>r.status==='REVIEW_REQUIRED'||r.status==='FAILED')?'REVIEW_REQUIRED':records.every(r=>r.status==='PASS')?'PASS':'PENDING';
    const updates={contentSafety:{version:row.version,status:finalStatus,checkedAt:new Date()}};
    if(row.entityType==='PROFILE'&&finalStatus==='PASS')updates.avatarUrl=entity.pendingAvatarUrl;
    if(['BANNER','CATEGORY'].includes(row.entityType))updates.status=finalStatus==='PASS'?(entity.desiredStatus||'ACTIVE'):'REVIEWING';
    await tx.collection(collection).doc(entity._id).update({data:updates});
  });
}
module.exports={reviewAssets,processPending,handleMedia,checkText};
