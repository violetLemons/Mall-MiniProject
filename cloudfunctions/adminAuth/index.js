const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const c = require('./common/commerce');
const { success, fail } = require('./common/response');
const { verifyPassword, createToken, permissionVersion } = require('./common/crypto');
const { requireAdmin } = require('./common/authMiddleware');
exports.main = async event => {
  try {
    const { action, params = {} } = event;
    if (action === 'login') {
      const username = c.text(params.username, '用户名', 3, 64), password = c.text(params.password, '密码', 1, 128);
      const throttleId = c.key('admin-login', username);
      const permitted = await c.transaction(db, async tx => {
        const previous = await c.get(tx, 'auth_limits', throttleId);
        const fresh = !previous || previous.resetAt < Date.now();
        const count = fresh ? 1 : previous.count + 1;
        if (count > 10) return false;
        await tx.collection('auth_limits').doc(throttleId).set({ data: { count, resetAt: fresh ? Date.now() + 15 * 60000 : previous.resetAt } });
        return true;
      });
      if (!permitted) throw c.error('RATE_LIMITED', '登录尝试过多，请15分钟后再试');
      const res = await db.collection('admins').where({ username }).limit(1).get();
      const admin = res.data[0];
      if (!admin || admin.status !== 'ACTIVE' || admin.role !== 'SUPER_ADMIN' || !verifyPassword(password, admin.salt, admin.passwordHash))
        throw c.error('AUTH_FAILED', '用户名或密码错误，或账号不可用');
      await db.collection('admins').doc(admin._id).update({ data: { lastLoginAt: new Date() } });
      const token = createToken({ adminId: admin._id, version: permissionVersion(admin) }, 12 * 3600);
      return success({ token, adminId: admin._id, username, name: admin.name || '', phone: admin.phone || '', address: admin.address || '', role: admin.role, permissions: admin.permissions || [], expiresIn: 12 * 3600 });
    }
    const admin = await requireAdmin(event, db);
    if (action === 'getProfile') return success(admin);
    if (action === 'logout') {
      await c.transaction(db, async tx => {
        const a = await c.get(tx, 'admins', admin.adminId);
        await tx.collection('admins').doc(a._id).update({ data: { sessionVersion: (a.sessionVersion || 0) + 1 } });
      });
      return success(null);
    }
    throw c.error('ACTION_NOT_FOUND', '操作不存在');
  } catch (e) { return fail(e.code, e.message); }
};
