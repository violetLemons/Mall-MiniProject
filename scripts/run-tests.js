const { spawnSync } = require('child_process');
const path = require('path');
const result = spawnSync(process.execPath, ['--test', path.join(__dirname,'tests/commerce.test.js'), path.join(__dirname,'tests/functions.test.js')], { stdio: 'inherit', env: { ...process.env, APP_ENV: 'test', PAYMENT_MODE: 'test' } });
process.exitCode = result.status === null ? 1 : result.status;
