// Export isolated test orders only. No network or cloud mutation.
const fs=require('fs'),path=require('path'),{createDb}=require('./lib/local-db'),c=require('../cloudfunctions/common/commerce');
async function main(){
  if(process.argv.includes('--apply'))throw Error('请使用隔离环境控制台导入；此脚本只导出测试数据');
  process.env.APP_ENV='test';process.env.PAYMENT_MODE='test';
  const db=createDb({users:[{_id:'seed_user',_openid:'test-buyer',balance:5000}],products:[{_id:'seed_product',name:'隔离测试商品',status:'ON_SALE',sales:0}],product_skus:[{_id:'seed_sku',productId:'seed_product',status:'ACTIVE',price:1000}]});
  const shippingAddress={name:'测试',phone:'13800000000',province:'测试省',city:'测试市',district:'测试区',detail:'测试地址'};
  await c.createOrder(db,'test-buyer',{requestId:'seed-request-00001',items:[{skuId:'seed_sku',count:1}],shippingAddress});
  const index=process.argv.indexOf('--out'),out=path.resolve(index>=0?process.argv[index+1]:'work/order-seed');
  if(out===path.parse(out).root)throw Error('输出目录无效');fs.mkdirSync(out,{recursive:true});
  for(const [name,rows]of Object.entries(db.snapshot()))fs.writeFileSync(path.join(out,name+'.json'),rows.map(row=>JSON.stringify(row)).join('\n'));
  console.log('仅导出测试夹具：'+out+'；未连接云环境。');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
