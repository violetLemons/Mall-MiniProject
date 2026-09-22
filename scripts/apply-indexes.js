/**
 * 把 scripts/init-db.js 中的索引规划真正落到云端。
 * 通过 `tcb db nosql execute` 执行 MongoDB 原生 createIndexes（幂等，可重复执行）。
 *
 * 用法：
 *   node scripts/apply-indexes.js                 # DRY-RUN，仅打印将执行的命令
 *   node scripts/apply-indexes.js --apply         # 真实写入（幂等）
 *   node scripts/apply-indexes.js --apply --merchant-only   # 只建多商家相关索引
 *
 * 依赖：已登录的 tcb CLI + bash（Git Bash）。环境变量 TCB_ENV_ID 可覆盖默认 env。
 */
const { spawnSync } = require('child_process');
const { COLLECTIONS_CONFIG } = require('./init-db');

const ENV_ID = process.env.TCB_ENV_ID || 'cloud1-d3gffg6ok96e6cf3f';

// 多商家改造新增的索引（阶段 6 的 delta）：按「集合名.索引名」精确匹配
const MERCHANT_ONLY = new Set([
  'merchant_orders.idx_merchant',
  'merchant_orders.idx_parent_order',
  'merchant_orders.idx_sub_order_no',
  'merchant_orders.idx_user_status',
  'merchant_orders.idx_created_at',
  'products.idx_merchant',
  'admins.idx_merchant',
  'refund_records.idx_merchant',
  'refund_records.idx_parent_order',
  'refund_records.idx_out_refund_no'
]);

function buildCommands({ merchantOnly }) {
  const out = [];
  for (const col of COLLECTIONS_CONFIG) {
    const indexes = (col.indexes || [])
      .filter(idx => !merchantOnly || MERCHANT_ONLY.has(`${col.name}.${idx.name}`))
      .map(idx => ({
        key: idx.key,
        name: idx.name,
        ...(idx.unique ? { unique: true } : {})
      }));
    if (indexes.length === 0) continue;
    out.push({
      collection: col.name,
      count: indexes.length,
      mgo: [{
        TableName: col.name,
        CommandType: 'COMMAND',
        Command: JSON.stringify({ createIndexes: col.name, indexes })
      }]
    });
  }
  return out;
}

function applyOne(cmd) {
  const json = JSON.stringify(cmd.mgo); // 紧凑 JSON，无空格无单引号，可安全包单引号
  const shell = `tcb db nosql execute -e ${ENV_ID} --command '${json}'`;
  const r = spawnSync('bash', ['-c', shell], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0, out };
}

function run() {
  const isApply = process.argv.includes('--apply');
  const merchantOnly = process.argv.includes('--merchant-only');
  const commands = buildCommands({ merchantOnly });

  console.log(`目标环境: ${ENV_ID}`);
  console.log(`范围: ${merchantOnly ? '仅多商家索引' : '全部清单索引'}`);
  console.log(`模式: ${isApply ? 'APPLY（真实写入，幂等）' : 'DRY-RUN（仅打印命令）'}`);
  console.log(`涉及集合: ${commands.length} 个，索引总数: ${commands.reduce((s, c) => s + c.count, 0)}\n`);

  let fail = 0;
  for (const cmd of commands) {
    const json = JSON.stringify(cmd.mgo);
    if (!isApply) {
      console.log(`[DRY-RUN] ${cmd.collection}（${cmd.count} 个索引）`);
      console.log(`  tcb db nosql execute -e ${ENV_ID} --command '${json}'\n`);
      continue;
    }
    const { ok, out } = applyOne(cmd);
    if (ok) {
      const after = (out.match(/"numIndexesAfter"[\s\S]*?"\$numberInt":\s*"(\d+)"/) || [])[1];
      console.log(`[OK] ${cmd.collection}${after ? ` -> 索引总数 ${after}` : ''}`);
    } else {
      fail++;
      console.log(`[FAIL] ${cmd.collection}`);
      console.log(out.trim().split('\n').slice(-6).join('\n'));
      console.log('');
    }
  }

  if (isApply) {
    console.log(fail === 0 ? '全部索引已就绪。' : `有 ${fail} 个集合失败，见上方错误。`);
  } else {
    console.log('提示: 加 --apply 真正写入。命令已可直接复制到 bash 终端执行。');
  }
  if (fail > 0) process.exitCode = 1;
}

if (require.main === module) run();

module.exports = { buildCommands, MERCHANT_ONLY, ENV_ID };
