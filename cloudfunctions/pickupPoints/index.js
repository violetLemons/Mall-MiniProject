const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

const error = (code, message) => Object.assign(new Error(message), { code });
const key = (...parts) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);

function text(value, name, min = 1, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw error('INVALID_PARAMS', `${name}格式不正确 (需 ${min}~${max} 个字符)`);
  }
  return value.trim();
}

function success(data) {
  return {
    success: true,
    code: 'OK',
    message: '操作成功',
    data,
    requestId: crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random()),
    serverTime: Date.now()
  };
}

function fail(code, message) {
  return {
    success: false,
    code: (typeof code === 'string' && /^[A-Z_]{3,50}$/.test(code)) ? code : 'SYSTEM_ERROR',
    message: String(message || '服务异常'),
    data: null,
    requestId: crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random()),
    serverTime: Date.now()
  };
}

function getJwtSecret(event) {
  return event?.adminJwtSecret || process.env.ADMIN_JWT_SECRET || '636353631d78ee1619556dc0a92cd2f4111317b5820e821a6d307de9947b6bbf';
}

function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  try {
    const [h, b, s, extra] = token.split('.');
    if (!h || !b || !s || extra) return null;
    const header = JSON.parse(Buffer.from(h, 'base64url'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
    const p = JSON.parse(Buffer.from(b, 'base64url'));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(p.exp) || !Number.isSafeInteger(p.iat) || p.exp <= now || p.iat > now + 60 || p.exp - p.iat > 48 * 3600 || p.iss !== 'sneaker-admin' || p.aud !== 'sneaker-admin-api') return null;
    return p;
  } catch {
    return null;
  }
}

function permissionVersion(admin) {
  return crypto.createHash('sha256').update(JSON.stringify([admin.role, (admin.permissions || []).slice().sort(), admin.sessionVersion || 0])).digest('hex');
}

async function requireAdmin(event, database) {
  const secret = getJwtSecret(event);
  const headers = event.headers || event.header || {};
  const token = (event.token || headers.authorization || headers.Authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token, secret);
  if (!payload || !payload.adminId) throw error('AUTH_REQUIRED', '登录已失效，请重新登录');
  
  const res = await database.collection('admins').doc(payload.adminId).get().catch(() => null);
  const admin = res?.data;
  if (!admin || admin.status !== 'ACTIVE') throw error('ADMIN_REQUIRED', '管理员账号不存在或已停用');
  if (payload.version !== permissionVersion(admin)) throw error('AUTH_REQUIRED', '权限或会话已变更，请重新登录');
  return { adminId: admin._id, username: admin.username, role: admin.role, permissions: admin.permissions || [] };
}

function requirePermission(admin, permission) {
  if (admin.role === 'SUPER_ADMIN' || admin.permissions?.includes('*') || admin.permissions?.includes(permission)) return true;
  throw error('PERMISSION_DENIED', '无权执行此操作');
}

exports.main = async event => {
  try {
    const { action, params = {} } = event;
    if (action === 'list') {
      const res = await db.collection('pickup_points').where({ status: 'ACTIVE' }).limit(100).get();
      return success(res.data || []);
    }
    
    const admin = await requireAdmin(event, db);
    requirePermission(admin, 'pickup.manage');
    
    if (action === 'adminList') {
      const res = await db.collection('pickup_points').limit(100).get();
      return success(res.data || []);
    }
    
    if (action === 'delete') {
      const id = text(params.id, '自提点ID');
      await db.collection('pickup_points').doc(id).remove();
      return success({ id, deleted: true });
    }
    
    if (action !== 'save') throw error('ACTION_NOT_FOUND', '操作不存在');
    
    const id = params.id ? text(params.id, '自提点ID') : `pickup_${Date.now()}_${key(params.name || '')}`;
    const status = ['ACTIVE', 'DISABLED'].includes(params.status) ? params.status : 'ACTIVE';
    
    await db.collection('pickup_points').doc(id).set({
      data: {
        name: text(params.name, '名称', 2, 60),
        address: text(params.address, '地址', 2, 200),
        hours: text(params.hours || '09:00-22:00', '营业时间', 1, 80),
        phone: params.phone ? text(params.phone, '联系电话', 1, 30) : '',
        status,
        updatedAt: new Date()
      }
    });
    return success({ id });
  } catch (e) {
    return fail(e.code, e.message);
  }
};
