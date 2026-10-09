// Local export only. Catalog uses the existing maintained demo data.
const fs=require('fs'),path=require('path');
const {DEMO_CATEGORIES,DEMO_PRODUCTS,DEMO_SKUS}=require('./seed-demo-data');
const index=process.argv.indexOf('--out'),out=path.resolve(index>=0?process.argv[index+1]:'work/cloud-seed');
if(out===path.parse(out).root)throw Error('输出目录无效');fs.mkdirSync(out,{recursive:true});
for(const [name,rows]of Object.entries({categories:DEMO_CATEGORIES.filter(c=>!c._id.startsWith('cat_nuts')),products:DEMO_PRODUCTS.filter(p=>!p.categoryId.startsWith('cat_nuts')).map(p=>({...p,status:'OFF_SALE',sales:0})),product_skus:DEMO_SKUS.filter(s=>!['prod_nuts_daily','prod_dried_mango'].includes(s.productId))})){
  fs.writeFileSync(path.join(out,name+'.json'),rows.map(r=>JSON.stringify(r)).join('\n'));console.log(name+': '+rows.length+' documents');
}
console.log('仅导出文件，未连接云环境；商品默认下架，须通过微信审核后上架。');
