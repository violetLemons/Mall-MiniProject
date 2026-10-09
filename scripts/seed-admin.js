const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {hashPassword}=require('../cloudfunctions/common/crypto');
const password=process.env.INITIAL_ADMIN_PASSWORD;
if(!password||password.length<12||password.length>128)throw Error('请通过 INITIAL_ADMIN_PASSWORD 设置12~128位初始密码，脚本不会输出明文');
const salt=crypto.randomBytes(32).toString('hex'),admin={_id:'admin_super_01',username:'superadmin',name:'超级管理员',salt,passwordHash:hashPassword(password,salt),role:'SUPER_ADMIN',permissions:[],status:'ACTIVE',sessionVersion:0,createdAt:new Date(),updatedAt:new Date()};
const index=process.argv.indexOf('--out'),out=path.resolve(index>=0?process.argv[index+1]:'work/cloud-seed/admins.json');
if(out===path.parse(out).root)throw Error('输出路径无效');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(admin)+'\n');console.log('仅导出初始超管密码摘要，不连接云环境：'+out);
