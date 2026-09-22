const { verifyToken, permissionVersion, maskSecret } = require('./crypto');
const { error, get } = require('./commerce');
function parseEvent(event = {}) {
  if (!event.body) return event;
  let body;
  try { body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body; } catch { throw error('INVALID_PARAMS', 'JSON格式不正确'); }
  return { action: body.action, params: body.params || {}, headers: event.headers || {} };
}
async function requireAdmin(event, db) {
  if (event.adminJwtSecret && (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.length < 32)) {
    process.env.ADMIN_JWT_SECRET = event.adminJwtSecret;
  }
  const headers = event.headers || event.header || {};
  const token = event.token || (headers.authorization || headers.Authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token);
  if (!payload || !payload.adminId) throw error('AUTH_REQUIRED', '登录已失效，请重新登录');
  const admin = await get(db, 'admins', payload.adminId);
  if (!admin || admin.status !== 'ACTIVE') throw error('ADMIN_REQUIRED', '管理员账号不存在或已停用');
  if (payload.version !== permissionVersion(admin)) throw error('AUTH_REQUIRED', '权限或会话已变更，请重新登录');
  return { adminId: admin._id, username: admin.username, role: admin.role, permissions: admin.permissions || [], merchantId: admin.merchantId || null, subMchIdMask: admin.subMchIdEnc ? maskSecret(admin.subMchIdEnc) : '' };
}
function requirePermission(admin, permission) {
  if (admin.role === 'SUPER_ADMIN' || admin.permissions?.includes('*') || admin.permissions?.includes(permission)) return true;
  throw error('PERMISSION_DENIED', '无权执行此操作');
}
module.exports = { parseEvent, requireAdmin, requirePermission };
