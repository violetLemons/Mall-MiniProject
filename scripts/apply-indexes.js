// Emit argument arrays for the existing CLI; explicit --apply and environment are required.
const {spawnSync}=require('child_process'),{COLLECTIONS_CONFIG}=require('./init-db');
function buildCommands(){return COLLECTIONS_CONFIG.filter(c=>c.indexes.length).map(c=>({collection:c.name,indexes:c.indexes,mgo:[{TableName:c.name,CommandType:'COMMAND',Command:JSON.stringify({createIndexes:c.name,indexes:c.indexes})}]}));}
function run(){const apply=process.argv.includes('--apply'),env=process.env.TCB_ENV_ID;
  if(apply&&(!env||!/^[a-zA-Z0-9_-]+$/.test(env)))throw Error('真实写入必须通过 TCB_ENV_ID 明确指定环境');
  for(const cmd of buildCommands()){
    const args=['db','nosql','execute','-e',env||'REPLACE_WITH_TARGET_ENV_ID','--command',JSON.stringify(cmd.mgo)];
    if(!apply){console.log(JSON.stringify({collection:cmd.collection,args}));continue;}
    const result=spawnSync(process.platform==='win32'?'tcb.cmd':'tcb',args,{encoding:'utf8',shell:false});
    if(result.status!==0)throw Error('索引写入失败：'+cmd.collection+'；请用控制台核对，脚本不会自动切换环境');
  }
}
if(require.main===module){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={buildCommands};
