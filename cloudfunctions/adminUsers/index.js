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

    /**
     * 更新商户资料 (名称 + 地址)
     * 商家可设置自己的名称与地址；超管可代任意商家填写
     * 名称用于订单页展示，地址用于后续快递系统估算与用户距离计算运费
     */
    if (action === 'updateProfile') {
      const { name, address, phone, adminId } = params;
      const targetId = admin.role === 'SUPER_ADMIN' ? (adminId || admin.adminId) : admin.adminId;
      const target = await db.collection('admins').doc(targetId).get().catch(() => null);
      if (!target || !target.data) return fail('ADMIN_NOT_FOUND', '目标账号不存在');
      if (target.data.role !== 'MERCHANT') return fail('INVALID_PARAMS', '仅商家账号可设置名称与地址');

      const nameVal = typeof name === 'string' ? name.trim() : '';
      const addressVal = typeof address === 'string' ? address.trim() : '';
      const phoneVal = typeof phone === 'string' ? phone.trim() : '';
      if (!nameVal && !addressVal && !phoneVal) return fail('INVALID_PARAMS', '名称、地址与手机号不能同时为空');
      if (nameVal && (nameVal.length < 2 || nameVal.length > 64)) return fail('INVALID_PARAMS', '商户名称需为 2-64 个字符');
      if (addressVal.length > 200) return fail('INVALID_PARAMS', '地址长度不能超过 200 字');
      if (phoneVal && !/^1\d{10}$/.test(phoneVal)) return fail('INVALID_PARAMS', '手机号格式不正确（需为 11 位大陆手机号）');

      const updateData = { updatedAt: db.serverDate() };
      if (nameVal) updateData.name = nameVal;
      if (addressVal) updateData.address = addressVal;
      if (phoneVal) updateData.phone = phoneVal;
      await db.collection('admins').doc(targetId).update({ data: updateData });

      const finalName = nameVal || target.data.name || '';
      const finalAddress = addressVal || target.data.address || '';
      const finalPhone = phoneVal || target.data.phone || '';
      await recordOperationLog(db, {
        adminId: admin.adminId,
        adminUsername: admin.username,
        action: 'UPDATE_MERCHANT_PROFILE',
        resourceType: 'ADMIN',
        resourceId: targetId,
        after: { name: finalName, address: finalAddress, phone: finalPhone }
      });
      return success({ name: finalName, address: finalAddress, phone: finalPhone }, '商户资料已保存');
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
            name: true,
            phone: true,
            address: true,
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
        const { username, password, role = 'ADMIN', permissions = [], merchantId = null, subMchId = null, name = null, phone = null } = params;
        const nameVal = typeof name === 'string' ? name.trim() : '';
        const phoneVal = typeof phone === 'string' ? phone.trim() : '';
        if (!username || !password || password.length < 8) {
          return fail('INVALID_PARAMS', '账号与密码不可为空，且密码长度不少于 8 位密码');
        }
        if (!nameVal || nameVal.length < 2 || nameVal.length > 64) {
          return fail('INVALID_PARAMS', '姓名/名称不能为空，且长度为 2-64 字');
        }
        if (phoneVal && !/^1\d{10}$/.test(phoneVal)) {
          return fail('INVALID_PARAMS', '手机号格式不正确（需为 11 位大陆手机号）');
        }

        // 商家账号的 merchantId 由平台自动生成（m1、m2、m3… 最大序号 +1），不再要求管理员手动填写
        let merchantIdValue = merchantId;
        if (role === 'MERCHANT' && !merchantIdValue) {
          const existing = await db.collection('admins')
            .where({ role: 'MERCHANT' })
            .field({ merchantId: true })
            .limit(1000)
            .get();
          let maxSeq = 0;
          for (const a of existing.data) {
            const m = /^m(\d+)$/.exec(a.merchantId || '');
            if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
          }
          merchantIdValue = 'm' + (maxSeq + 1);
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
            name: nameVal,
            phone: phoneVal,
            passwordHash: pwdHash,
            salt,
            role,
            merchantId: role === 'MERCHANT' ? merchantIdValue : null,
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
          after: { username, name: nameVal, phone: phoneVal, role, merchantId: role === 'MERCHANT' ? merchantIdValue : null, subMchIdMask: subMchIdEnc ? maskSecret(subMchIdEnc) : '' }
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
       * 下架商家：账号冻结(SUSPENDED，不可登录) + 商品全部下架，快照 ON_SALE 商品供上架撤回恢复
       */
      case 'suspendMerchant': {
        const { adminId } = params;
        if (!adminId) return fail('INVALID_PARAMS', '缺少目标账号ID');
        const target = await db.collection('admins').doc(adminId).get().catch(() => null);
        if (!target || !target.data) return fail('ADMIN_NOT_FOUND', '目标账号不存在');
        if (target.data.role !== 'MERCHANT') return fail('INVALID_PARAMS', '仅商家账号可下架');
        if (target.data.status !== 'ACTIVE') return fail('INVALID_PARAMS', '仅正常状态的商家可下架');
        const mId = target.data.merchantId;
        if (!mId) return fail('INVALID_PARAMS', '商家账号缺少 merchantId');

        const onSale = await db.collection('products').where({ merchantId: mId, status: 'ON_SALE' }).field({ _id: true }).limit(1000).get();
        const ids = onSale.data.map(p => p._id);
        if (ids.length > 0) {
          await db.collection('products').where({ merchantId: mId, status: 'ON_SALE' }).update({ data: { status: 'OFF_SALE', updatedAt: db.serverDate() } });
        }

        await db.collection('admins').doc(adminId).update({
          data: {
            status: 'SUSPENDED',
            suspendedProductIds: ids,
            suspendedAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });

        await recordOperationLog(db, {
          adminId: admin.adminId,
          adminUsername: admin.username,
          action: 'SUSPEND_MERCHANT',
          resourceType: 'ADMIN',
          resourceId: adminId,
          after: { merchantId: mId, suspendedProductCount: ids.length }
        });

        return success({ suspendedProductCount: ids.length }, '商家已下架，其商品已全部下架');
      }

      /**
       * 上架撤回：恢复商家为 ACTIVE，并把快照中仍为 OFF_SALE 的商品恢复 ON_SALE
       */
      case 'resumeMerchant': {
        const { adminId } = params;
        if (!adminId) return fail('INVALID_PARAMS', '缺少目标账号ID');
        const target = await db.collection('admins').doc(adminId).get().catch(() => null);
        if (!target || !target.data) return fail('ADMIN_NOT_FOUND', '目标账号不存在');
        if (target.data.status !== 'SUSPENDED') return fail('INVALID_PARAMS', '仅下架中的商家可上架撤回');
        const mId = target.data.merchantId;
        const ids = Array.isArray(target.data.suspendedProductIds) ? target.data.suspendedProductIds : [];

        if (mId && ids.length > 0) {
          await db.collection('products').where({ merchantId: mId, status: 'OFF_SALE', _id: db.command.in(ids) }).update({ data: { status: 'ON_SALE', updatedAt: db.serverDate() } });
        }

        await db.collection('admins').doc(adminId).update({
          data: { status: 'ACTIVE', suspendedProductIds: [], suspendedAt: null, updatedAt: db.serverDate() }
        });

        await recordOperationLog(db, {
          adminId: admin.adminId,
          adminUsername: admin.username,
          action: 'RESUME_MERCHANT',
          resourceType: 'ADMIN',
          resourceId: adminId,
          after: { merchantId: mId, restoredProductCount: ids.length }
        });

        return success(null, '商家已上架撤回，商品状态已恢复');
      }

      /**
       * 删除商家：账号 DELETED(永久不可登录) + 商品全部下架，历史订单保留不删
       */
      case 'deleteMerchant': {
        const { adminId } = params;
        if (!adminId) return fail('INVALID_PARAMS', '缺少目标账号ID');
        if (adminId === admin.adminId) return fail('OPERATION_FORBIDDEN', '不能删除当前登录账号');
        const target = await db.collection('admins').doc(adminId).get().catch(() => null);
        if (!target || !target.data) return fail('ADMIN_NOT_FOUND', '目标账号不存在');
        if (target.data.role !== 'MERCHANT') return fail('INVALID_PARAMS', '仅商家账号可删除');
        const mId = target.data.merchantId;
        if (!mId) return fail('INVALID_PARAMS', '商家账号缺少 merchantId');

        await db.collection('products').where({ merchantId: mId, status: db.command.in(['ON_SALE', 'OFF_SALE']) }).update({ data: { status: 'OFF_SALE', updatedAt: db.serverDate() } });

        await db.collection('admins').doc(adminId).update({
          data: { status: 'DELETED', suspendedProductIds: [], suspendedAt: null, updatedAt: db.serverDate() }
        });

        await recordOperationLog(db, {
          adminId: admin.adminId,
          adminUsername: admin.username,
          action: 'DELETE_MERCHANT',
          resourceType: 'ADMIN',
          resourceId: adminId,
          after: { merchantId: mId }
        });

        return success(null, '商家已删除，其商品已全部下架，历史订单已保留');
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
