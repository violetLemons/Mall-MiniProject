/**
 * 初始超级管理员生成脚本 (Seed Admin)
 * 使用 scrypt + 32位强随机盐，绝对禁止明文密码
 */

const crypto = require('crypto');

function hashPassword(password, customSalt = null) {
  const salt = customSalt || crypto.randomBytes(32).toString('hex');
  const hash = `scrypt$${crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
  return { salt, hash };
}

// 默认生成预置超级管理员数据
const defaultUsername = 'superadmin';
const defaultPassword = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');

const { salt, hash } = hashPassword(defaultPassword);

const initialSuperAdmin = {
  _id: 'admin_super_01',
  username: defaultUsername,
  passwordHash: hash,
  salt: salt,
  role: 'SUPER_ADMIN',
  permissions: ['*'], // 超级管理员拥有全局通配符权限
  status: 'ACTIVE',
  failedLoginAttempts: 0,
  lockUntil: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

console.log('========================================================');
console.log('   通用商城 · 初始超级管理员安全凭证生成成功          ');
console.log('========================================================');
console.log(`用户名 (Username): ${defaultUsername}`);
console.log(`初始密码 (Password): ${defaultPassword}`);
console.log(`Salt (32 bytes):   ${salt}`);
console.log(`PasswordHash:      ${hash}`);
console.log('--------------------------------------------------------');
console.log('已生成可直接写入 admins 集合的 JSON 数据：');
console.log(JSON.stringify(initialSuperAdmin, null, 2));
console.log('========================================================');

module.exports = {
  hashPassword,
  initialSuperAdmin
};
