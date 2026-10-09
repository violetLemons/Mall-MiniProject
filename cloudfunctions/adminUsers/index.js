const cloud = require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database(),c=require('./common/commerce'),crypto=require('crypto');
const {requireAdmin}=require('./common/authMiddleware'),{hashPassword}=require('./common/crypto'),{success,fail}=require('./common/response');
function publicAdmin(a){return {id:a._id,username:a.username,name:a.name||'',phone:a.phone||'',role:a.role,status:a.status,permissions:[],createdAt:a.createdAt};}
exports.main=async event=>{try{
  const admin=await requireAdmin(event,db),{action,params={}}=event;
  if(action==='list'){const result=await db.collection('admins').where({role:'SUPER_ADMIN'}).orderBy('createdAt','desc').limit(100).get();return success({list:result.data.map(publicAdmin),total:result.data.length});}
  if(action==='operationLogs'){const page=c.integer(params.page||1,'页码',1,10000),pageSize=c.integer(params.pageSize||50,'每页',1,100);const [list,total]=await Promise.all([db.collection('operation_logs').orderBy('createdAt','desc').skip((page-1)*pageSize).limit(pageSize).get(),db.collection('operation_logs').count()]);return success({list:list.data,total:total.total,page,pageSize});}
  if(action==='create'){
    if(params.role&&params.role!=='SUPER_ADMIN')throw c.error('INVALID_PARAMS','仅支持超级管理员');
    const username=c.text(params.username,'用户名',3,64),password=c.text(params.password,'密码',12,128),salt=crypto.randomBytes(16).toString('hex'),id=c.key('admin',username);
    return success(await c.transaction(db,async tx=>{const existing=(await tx.collection('admins').where({username}).limit(1).get()).data[0];if(existing)throw c.error('USERNAME_EXISTS','用户名已存在');
      await tx.collection('admins').doc(id).set({data:{username,name:c.text(params.name||username,'姓名',1,64),role:'SUPER_ADMIN',permissions:[],status:'ACTIVE',salt,passwordHash:hashPassword(password,salt),sessionVersion:0,createdAt:new Date(),updatedAt:new Date()}});
      await tx.collection('operation_logs').add({data:{adminId:admin.adminId,action:'CREATE_ADMIN',resourceId:id,createdAt:new Date()}});return {id};}));
  }
  const id=c.text(params.id||params.adminId,'账号ID');
  return success(await c.transaction(db,async tx=>{
    const target=await c.get(tx,'admins',id);if(!target||target.role!=='SUPER_ADMIN')throw c.error('ADMIN_NOT_FOUND','账号不存在');
    let data={updatedAt:new Date()};
    if(action==='toggleStatus'){
      const status=params.status;
      if(!['ACTIVE','DISABLED'].includes(status))throw c.error('INVALID_PARAMS','账号状态无效');
      if(status===target.status)return {id};
      if(status==='DISABLED'){
        if(id===admin.adminId)throw c.error('FORBIDDEN','不能停用当前登录账号');
        const active=await tx.collection('admins').where({role:'SUPER_ADMIN',status:'ACTIVE'}).get();if(active.data.length<=1)throw c.error('FORBIDDEN','须保留至少一个可用超管');
      }Object.assign(data,{status,sessionVersion:(target.sessionVersion||0)+1});
    }else if(action==='resetPassword'){
      const password=c.text(params.password,'密码',12,128),salt=crypto.randomBytes(16).toString('hex');Object.assign(data,{salt,passwordHash:hashPassword(password,salt),sessionVersion:(target.sessionVersion||0)+1});
    }else throw c.error('ACTION_NOT_FOUND','操作不存在');
    await tx.collection('admins').doc(id).update({data});await tx.collection('operation_logs').add({data:{adminId:admin.adminId,action,resourceId:id,createdAt:new Date()}});return {id};
  }));
}catch(e){return fail(e.code||'SYSTEM_ERROR',e.code?e.message:'账号管理服务异常');}};
