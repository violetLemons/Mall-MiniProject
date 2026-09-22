/**
 * 云函数独立打包与依赖准备脚本
 * 解决微信云开发各云函数独立上传隔离部署时无法跨目录 require('../common') 的架构问题
 */

const fs = require('fs');
const path = require('path');

const CLOUD_FUNCTIONS_ROOT = path.resolve(__dirname, '../cloudfunctions');
const COMMON_DIR = path.join(CLOUD_FUNCTIONS_ROOT, 'common');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function bundleFunctions() {
  console.log('[Bundle] Starting cloud functions bundling...');

  if (!fs.existsSync(COMMON_DIR)) {
    console.error('[Bundle Error] common directory does not exist:', COMMON_DIR);
    process.exit(1);
  }

  const dirs = fs.readdirSync(CLOUD_FUNCTIONS_ROOT, { withFileTypes: true });
  let bundledCount = 0;

  for (const dir of dirs) {
    if (!dir.isDirectory() || dir.name === 'common') continue;

    const funcDir = path.join(CLOUD_FUNCTIONS_ROOT, dir.name);
    const targetCommonDir = path.join(funcDir, 'common');

    // 1. 同步公共 common 模块到每个云函数子目录
    copyDirRecursive(COMMON_DIR, targetCommonDir);

    // 2. 补全云函数 package.json (若不存在)
    const pkgPath = path.join(funcDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      const pkgContent = {
        name: dir.name,
        version: '1.0.0',
        description: `通用商城 Cloud Function - ${dir.name}`,
        main: 'index.js',
        dependencies: {
          'wx-server-sdk': '~2.6.3'
        }
      };
      fs.writeFileSync(pkgPath, JSON.stringify(pkgContent, null, 2), 'utf8');
    }

    bundledCount++;
    console.log(`[Bundle] -> Bundled: ${dir.name}`);
  }

  console.log(`[Bundle] Successfully bundled ${bundledCount} cloud functions.`);
}

bundleFunctions();
