/**
 * CloudBase 数据库集合与索引初始化配置脚本 (Database Schema & Indexes)
 * 输出 CloudBase 数据库集合、索引与权限清单。
 * 微信开发者工具 CLI 不提供数据库 DDL 接口，因此本脚本不会伪装执行云端写入。
 * 默认打印清单；可用 --json <path> 导出供控制台或部署脚本使用。
 */

const fs = require('fs');
const path = require('path');

const COLLECTIONS_CONFIG = require('../cloudfunctions/common/schema');

function run() {
  const isApply = process.argv.includes('--apply');
  const jsonIndex = process.argv.indexOf('--json');
  const jsonPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : '';
  console.log('================================================================');
  console.log('           通用商城 CloudBase 数据库集合与索引规划            ');
  console.log('================================================================');
  console.log(`执行模式: ${isApply ? '【拒绝伪执行 APPLY】' : '【安全清单 DRY-RUN】'}`);
  console.log(`集合总数: ${COLLECTIONS_CONFIG.length} 个集合\n`);

  COLLECTIONS_CONFIG.forEach((col, idx) => {
    console.log(`[${idx + 1}/${COLLECTIONS_CONFIG.length}] 集合: ${col.name.padEnd(22)} 描述: ${col.desc}`);
    col.indexes.forEach(idxDef => {
      const keys = Object.entries(idxDef.key).map(([k, v]) => `${k}:${v}`).join(', ');
      console.log(`      ↳ 索引: ${idxDef.name.padEnd(20)} 字段: { ${keys} } ${idxDef.unique ? '(UNIQUE)' : ''}`);
    });
  });

  if (jsonPath) {
    const target = path.resolve(jsonPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify({ collections: COLLECTIONS_CONFIG }, null, 2)}\n`, 'utf8');
    console.log(`已导出数据库清单: ${target}`);
  }
  console.log('================================================================');
  if (isApply) {
    console.error('错误: 微信开发者工具 CLI 当前没有 CloudBase 数据库建表/索引 API，本脚本未执行任何云端写入。');
    console.error('请在 CloudBase 控制台按清单创建集合、索引和权限，并在完成后读取结果留档。');
    process.exitCode = 2;
  } else {
    console.log('提示: 当前仅输出清单，未对云端数据库做任何修改。');
    console.log('可使用 node scripts/init-db.js --json work/cloud-seed/database-manifest.json 导出结构清单。');
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  COLLECTIONS_CONFIG
};
