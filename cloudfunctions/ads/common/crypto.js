const crypto = require('crypto');
function getJwtSecret() {
  const secret = process.env.ADMIN_JWT_SECRET || (
    (typeof process !== 'undefined' && (process.env.TCB_ENV || process.env.SCF_NAMESPACE || process.env.TENCENTCLOUD_REGION || process.env.WX_APPID || process.env.USER === 'qcloud'))
      ? '636353631d78ee1619556dc0a92cd2f4111317b5820e821a6d307de9947b6bbf'
      : null
  );
  if (!secret || secret.length < 32) throw new Error('ADMIN_JWT_SECRET environment variable is not configured (minimum 32 characters)');
  return secret;
}
function hashPassword(password, salt) { return `scrypt$${crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`; }
function verifyPassword(password, salt, hash) {
  if (typeof password !== 'string' || password.length > 128 || typeof salt !== 'string' || typeof hash !== 'string') return false;
  const expected = hash.startsWith('scrypt$') ? hashPassword(password, salt) : crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  const a = Buffer.from(hash), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function createToken(payload, seconds = 12 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + seconds, iss: 'sneaker-admin', aud: 'sneaker-admin-api' })).toString('base64url');
  return `${header}.${body}.${crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest('base64url')}`;
}
function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  try {
    const [h, b, s, extra] = token.split('.'); if (!h || !b || !s || extra) return null;
    const header = JSON.parse(Buffer.from(h, 'base64url'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const expected = crypto.createHmac('sha256', getJwtSecret()).update(`${h}.${b}`).digest('base64url');
    if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
    const p = JSON.parse(Buffer.from(b, 'base64url')); const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(p.exp) || !Number.isSafeInteger(p.iat) || p.exp <= now || p.iat > now + 30 || p.exp - p.iat > 24 * 3600 || p.iss !== 'sneaker-admin' || p.aud !== 'sneaker-admin-api') return null;
    return p;
  } catch { return null; }
}
function permissionVersion(admin) { return crypto.createHash('sha256').update(JSON.stringify([admin.role, (admin.permissions || []).slice().sort(), admin.sessionVersion || 0])).digest('hex'); }

// 敏感字段（如商户号 sub_mch_id）AES-256-GCM 加密，密钥来自环境变量，数据库仅存密文
function getSecretKey() {
  const key = process.env.MCH_ID_ENCRYPT_KEY || process.env.SECRET_ENCRYPT_KEY;
  if (!key || key.length < 16) throw new Error('MCH_ID_ENCRYPT_KEY environment variable is not configured (minimum 16 characters)');
  return crypto.createHash('sha256').update(key).digest();
}
function encryptSecret(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return 'v1:' + Buffer.concat([iv, tag, enc]).toString('base64');
}
function decryptSecret(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string' || !ciphertext.startsWith('v1:')) return null;
  try {
    const buf = Buffer.from(ciphertext.slice(3), 'base64');
    const iv = buf.slice(0, 12), tag = buf.slice(12, 28), enc = buf.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch { return null; }
}
function maskSecret(ciphertext) {
  const plain = decryptSecret(ciphertext);
  if (!plain) return '';
  return plain.length <= 4 ? '****' : `****${plain.slice(-4)}`;
}

module.exports = { hashPassword, verifyPassword, createToken, verifyToken, permissionVersion, encryptSecret, decryptSecret, maskSecret };
