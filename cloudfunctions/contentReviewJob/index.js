const cloud=require('wx-server-sdk');cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database(),{processPending}=require('./common/contentSafety');
exports.main=async()=>{if(cloud.getWXContext().OPENID)return {success:false,code:'FORBIDDEN_CALLER'};return {success:true,results:await processPending(cloud,db,3)};};
