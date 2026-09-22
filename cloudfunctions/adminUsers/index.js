const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function getCommon(name) {
  try {
    return require(`./common/${name}`);
  } catch (e) {
    return require(`../common/${name}`);
  }
}

const { success, fail } = getCommon('response');
const { requireAdmin, requirePermission } = getCommon('authMiddleware');
const { hashPassword } = getCommon('crypto');
const { recordOperationLog } = getCommon('logger');

exports.main = async (event, context) => {
  const { action, params = {} } = event;

  try {
    const admin = await requireAdmin(event, db);
    requirePermission(admin, 'admin.manage'); // 仅超管

    switch (action) {
      /**
       * 1. 获取管理员列表 (绝不暴露 salt 和 passwordHash)
       */
      case 'list': {
        const res = await db.collection('admins')
          .field({
            _id: true,
            username: true,
            role: true,
            permissions: true,
            merchantId: true,
            status: true,
            lastLoginAt: true,
            createdAt: true
          })
          .orderBy('createdAt', 'desc')
          .get();

        return success(res.data);
      }

      /**
       * 2. 新增管理员 (服务端加盐 Hash，杜绝弱密码)
       */
      case 'create': {
        const { username, password, role = 'ADMIN', permissions = [], merchantId = null } = params;
        if (!username || !password || password.length < 8) {
          return fail('INVALID_PARAMS', '账号与密码不可为空，且密码长度不少于 8 位密码');
        }
        if (role === 'MERCHANT' && !merchantId) {
          return fail('INVALID_PARAMS', '创建商家账号必须填写商家 ID (merchantId)');
        }

        const exist = await db.collection('admins').where({ username }).count();
        if (exist.total > 0) {
          return fail('USERNAME_EXISTS', '该管理员账号已被占用');
        }

        const crypto = require('crypto');
        const salt = crypto.randomBytes(32).toString('hex');
        const pwdHash = hashPassword(password, salt);

        const addRes = await db.collection('admins').add({
          data: {
            username,
            passwordHash: pwdHash,
            salt,
            role,
            merchantId: role === 'MERCHANT' ? merchantId : null,
            permissions: role === 'SUPER_ADMIN' ? ['*'] : permissions,
            status: 'ACTIVE',
            failedLoginAttempts: 0,
            lockUntil: null,
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });

        await recordOperationLog(db, {
          adminId: admin.adminId,
          adminUsername: admin.username,
          action: 'CREATE_ADMIN',
          resourceType: 'ADMIN',
          resourceId: addRes._id,
          after: { username, role, merchantId: role === 'MERCHANT' ? merchantId : null }
        });

        return success({ adminId: addRes._id }, '管理员账号创建成功');
      }

      /**
       * 3. 封禁 / 解封管理员
       */
      case 'toggleStatus': {
        const { adminId, status } = params;
        if (!adminId || !['ACTIVE', 'DISABLED'].includes(status)) {
          return fail('INVALID_PARAMS', '参数不合法');
        }

        if (adminId === admin.adminId) {
          return fail('OPERATION_FORBIDDEN', '严禁封禁当前登录的超级管理员自己');
        }

        await db.collection('admins').doc(adminId).update({
          data: {
            status,
            updatedAt: db.serverDate()
          }
        });

        await recordOperationLog(db, {
          adminId: admin.adminId,
          adminUsername: admin.username,
          action: 'TOGGLE_ADMIN_STATUS',
          resourceType: 'ADMIN',
          resourceId: adminId,
          after: { status }
        });

        return success(null, status === 'ACTIVE' ? '管理员已启用' : '管理员已冻结封禁');
      }

      /**
       * 4. 查询管理员操作审计日志 (需 logs.view 或超管权限)
       */
      case 'operationLogs': {
        const page = Math.max(Number(params.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
        const countRes = await db.collection('operation_logs').count();
        const logsRes = await db.collection('operation_logs')
          .orderBy('createdAt', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get();
        return success({
          list: logsRes.data,
          total: countRes.total,
          page,
          pageSize
        });
      }

      default:
        return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
    }
  } catch (err) {
    console.error(`[adminUsers][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || '管理员管理异常');
  }
};
