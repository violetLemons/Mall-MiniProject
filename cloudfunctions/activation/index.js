/**
 * 卡密兑换云函数 (activation)
 * 提供用户卡密兑换 (redeem) 与管理员批量生成卡密 (generate) 两个能力。
 * 卡密表 activation_codes：code 唯一，status 为 UNUSED / USED / DISABLED。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

const { success, fail } = require('./common/response');
const { requireAdmin, requirePermission } = require('./common/authMiddleware');

exports.main = async (event) => {
  const { action, params = {} } = event;
  const openid = cloud.getWXContext().OPENID;

  try {
    // 1. 用户兑换卡密 (通过 openid 归属，杜绝伪造)
    if (action === 'redeem') {
      if (!openid) return fail('AUTH_REQUIRED', '请先登录');

      const code = String(params.code || '').trim().toUpperCase();
      if (!code) return fail('INVALID_PARAMS', '请输入卡密');

      const found = await db.collection('activation_codes').where({ code }).limit(1).get().catch(() => ({ data: [] }));
      if (!found.data || found.data.length === 0) return fail('CODE_NOT_FOUND', '卡密不存在，请核对后重试');

      const card = found.data[0];
      if (card.status === 'USED') return fail('CODE_USED', '该卡密已被使用');
      if (card.status === 'DISABLED') return fail('CODE_DISABLED', '该卡密已失效');

      const now = new Date();
      // 原子认领：仅当状态仍为 UNUSED 时才置为 USED，防止并发重复兑换
      const claim = await db.collection('activation_codes')
        .where({ _id: card._id, status: 'UNUSED' })
        .update({ data: { status: 'USED', redeemedBy: openid, redeemedAt: now, updatedAt: now } });
      const updated = (claim && claim.stats && claim.stats.updated) || 0;
      if (updated === 0) return fail('CODE_USED', '该卡密已被使用');

      // 记录兑换流水
      try {
        await db.collection('activation_records').add({
          data: {
            code,
            userId: openid,
            type: card.type || '',
            benefit: card.benefit || '',
            value: card.value || 0,
            createdAt: now
          }
        });
      } catch (recErr) {
        console.warn('[activation][redeem] record warn:', recErr && recErr.message);
      }

      return success({
        code,
        type: card.type || '',
        benefit: card.benefit || '',
        value: card.value || 0
      }, '兑换成功');
    }

    // 2. 管理员批量生成卡密 (经 adminGateway 转发并携带管理员凭证)
    if (action === 'generate') {
      const admin = await requireAdmin(event, db);
      requirePermission(admin, 'activation.manage');

      const count = Math.min(Math.max(Number(params.count) || 1, 1), 100);
      const type = String(params.type || 'COUPON').trim();
      const benefit = String(params.benefit || '').trim();
      const value = Number(params.value) || 0;
      const prefix = (String(params.prefix || 'FRUIT').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'FRUIT').slice(0, 8);

      const now = new Date();
      const codes = [];
      for (let i = 0; i < count; i++) {
        const code = `${prefix}-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        await db.collection('activation_codes').add({
          data: {
            code,
            status: 'UNUSED',
            type,
            benefit,
            value,
            redeemedBy: '',
            redeemedAt: null,
            createdAt: now,
            updatedAt: now
          }
        });
        codes.push(code);
      }

      return success({ codes }, `已生成 ${count} 个卡密`);
    }

    return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
  } catch (err) {
    console.error(`[activation][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || '卡密服务异常');
  }
};
