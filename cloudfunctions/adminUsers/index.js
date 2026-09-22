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
const { hashPassword, encryptSecret, maskSecret } = getCommon('crypto');
const { recordOperationLog } = getCommon('logger');

exports.main = async (event, context) => {
  const { action, params = {} } = event;

  try {
    const admin = await requireAdmin(event, db);

    /**
     * 设置/更新商户号 (sub_mch_id，AES-256-GCM 加密存储)
     * 商家可设置自己的商户号；超管可代任意商家填写
     */
    if (action === 'setSubMchId') {
      const { subMchId, adminId } = params;
      if (typeof subMchId !== 'string' || !/^\d{8,32}$/.test(subMchId.trim())) {
        return fail('INVALID_PARAMS', '商户号格式不正确（需为 8-32 位数字）');
      }
      const targetId = admin.role === 'SUPER_ADMIN' ? (adminId || admin.adminId) : admin.adminId;
      const target = await db.collection('admins').doc(targetId).get().catch(() => null);
      if (!target || !target.data) {
        return fail('ADMIN_NOT_FOUND', '目标账号不存在');
      }
      if (target.data.role !== 'MERCHANT') {
        return fail('INVALID_PARAMS', '仅商家账号可填写商户号');
      }
      let subMchIdEnc;
      try {
        subMchIdEnc = encryptSecret(subMchId.trim());
      } catch (e) {
        console.error('[adminUsers][setSubMchId] encrypt failed:', e);
        return fail('CONFIG_ERROR', '商户号加密密钥未配置，请联系平台管理员');
      }
      await db.collection('admins').doc(targetId).update({
        data: { subMchIdEnc, updatedAt: db.serverDate() }
      });
      await recordOperationLog(db, {
        adminId: admin.adminId,
        adminUsername: admin.username,
        action: 'SET_SUB_MCH_ID',
        resourceType: 'ADMIN',
        resourceId: targetId,
        after: { subMchIdMask: maskSecret(subMchIdEnc) }
      });
      return success({ subMchIdMask: maskSecret(subMchIdEnc) }, '商户号已保存');
    }

    requirePermission(admin, 'admin.manage'); // 其余操作仅超管

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
            subMchIdEnc: true,
            status: true,
            lastLoginAt: true,
            createdAt: true
          })
          .orderBy('createdAt', 'desc')
          .get();

        const list = res.data.map(a => {
          const { subMchIdEnc, ...rest } = a;
          return { ...rest, subMchIdMask: subMchIdEnc ? maskSecret(subMchIdEnc) : '' };
        });

        return success(list);
      }

      /**
       * 2. 新增管理员 (服务端加盐 Hash，杜绝弱密码)
       */
      case 'create': {
        const { username, password, role = 'ADMIN', permissions = [], merchantId = null, subMchId = null } = params;
        if (!username || !password || password.length < 8) {
          return fail('INVALID_PARAMS', '账号与密码不可为空，且密码长度不少于 8 位密码');
        }
        if (role === 'MERCHANT' && !merchantId) {
          return fail('INVALID_PARAMS', '创建商家账号必须填写商家 ID (merchantId)');
        }

        let subMchIdEnc = null;
        if (role === 'MERCHANT' && typeof subMchId === 'string' && subMchId.trim()) {
          if (!/^\d{8,32}$/.test(subMchId.trim())) {
            return fail('INVALID_PARAMS', '商户号格式不正确（需为 8-32 位数字）');
          }
          try {
            subMchIdEnc = encryptSecret(subMchId.trim());
          } catch (e) {
            console.error('[adminUsers][create] encrypt failed:', e);
            return fail('CONFIG_ERROR', '商户号加密密钥未配置，请联系平台管理员');
          }
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
            subMchIdEnc,
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
          after: { username, role, merchantId: role === 'MERCHANT' ? merchantId : null, subMchIdMask: subMchIdEnc ? maskSecret(subMchIdEnc) : '' }
        });

        return success({ adminId: addRes._id, subMchIdMask: subMchIdEnc ? maskSecret(subMchIdEnc) : '' }, '管理员账号创建成功');
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
