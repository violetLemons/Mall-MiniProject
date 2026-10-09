/**
 * 卡密兑换云函数 (activation)
 * 提供用户卡密兑换 (redeem) 与管理员卡密管理 (generate / list / stats) 能力。
 * 卡密表 activation_codes：code 唯一，status 为 UNUSED / USED / DISABLED。
 * 购物额度类型 type=BALANCE，value 为整数分，expireAt 为截止日期，batchId 为同批标识。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

const commerce = require('./common/commerce');
const { success, fail } = require('./common/response');
const { requireAdmin } = require('./common/authMiddleware');

// 仅超级管理员可管理卡密（额度发放涉及资金，不放开给商家/运营）
function requireSuperAdmin(admin) {
  if (!admin || admin.role !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('仅超级管理员可操作卡密管理'), { code: 'PERMISSION_DENIED' });
  }
  return admin;
}

exports.main = async (event) => {
  const { action, params = {} } = event;
  const openid = cloud.getWXContext().OPENID;

  try {
    // 1. 用户兑换卡密 (通过 openid 归属，杜绝伪造；事务保证「认领 + 加额度」原子一致)
    if (action === 'redeem') {
      if (!openid) return fail('AUTH_REQUIRED', '请先登录');

      const code = String(params.code || '').trim().toUpperCase();
      if (!code) return fail('INVALID_PARAMS', '请输入卡密');

      const found = await db.collection('activation_codes').where({ code }).limit(1).get().catch(() => ({ data: [] }));
      if (!found.data || found.data.length === 0) return fail('CODE_NOT_FOUND', '卡密不存在，请核对后重试');

      const card = found.data[0];

      const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get().catch(() => ({ data: [] }));
      if (!userRes.data || userRes.data.length === 0) return fail('USER_NOT_FOUND', '用户不存在');
      const userId = userRes.data[0]._id;

      const now = new Date();
      await commerce.transaction(db,async tx=>{
        const current=await commerce.get(tx,'activation_codes',card._id);
        if(!current||current.status!=='UNUSED')throw commerce.error('CODE_USED','卡密已使用');
        if(current.type!=='BALANCE')throw commerce.error('INVALID_PARAMS','仅支持购物额度卡密');
        if(current.expireAt&&new Date(current.expireAt).getTime()<=Date.now())throw commerce.error('CODE_EXPIRED','卡密已过期');
        const value=commerce.integer(current.value,'额度分',1);
        await commerce.changeBalance(tx,openid,value,'ACTIVATION:'+card._id,null);
        await tx.collection('activation_codes').doc(card._id).update({data:{status:'USED',redeemedBy:openid,redeemedAt:now,updatedAt:now}});
        await tx.collection('activation_records').doc(commerce.key('activation',card._id)).set({data:{code,userId:openid,type:'BALANCE',value,createdAt:now}});
      });
      return success({
        code,
        type: card.type || '',
        benefit: card.benefit || '',
        value: card.value || 0
      }, '兑换成功');
    }

    // 2. 管理员批量生成卡密 (经 adminGateway 转发并携带管理员凭证)
    if (action === 'generate') {
      const admin = requireSuperAdmin(await requireAdmin(event, db));

      const count = commerce.integer(params.count || 1,'数量',1,500);
      const type = String(params.type || 'BALANCE').trim();
      const value = commerce.integer(params.value,'额度分',1);
      if(type !== 'BALANCE')return fail('INVALID_PARAMS','只支持购物额度卡密');
      const expireAtRaw = params.expireAt;
      const now = new Date();

      if (!Number.isInteger(value) || value <= 0) return fail('INVALID_PARAMS', '额度必须为正整数(分)');
      if (!expireAtRaw) return fail('INVALID_PARAMS', '请设置卡密截止日期');
      const expireAt = new Date(expireAtRaw);
      if (isNaN(expireAt.getTime()) || expireAt.getTime() <= now.getTime()) {
        return fail('INVALID_PARAMS', '截止日期必须晚于当前时间');
      }

      const benefit = String(params.benefit || '').trim() || (type === 'BALANCE' ? `${(value / 100)}元购物额度` : '');
      const prefix = (String(params.prefix || 'CARD').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CARD').slice(0, 8);
      const batchId = `B${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      const docs = [];
      const codes = [];
      for (let i = 0; i < count; i++) {
        const code = `${prefix}-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        docs.push({
          code,
          status: 'UNUSED',
          type,
          benefit,
          value,
          expireAt,
          batchId,
          redeemedBy: '',
          redeemedAt: null,
          createdAt: now,
          updatedAt: now
        });
        codes.push({ code, value, expireAt: expireAt.toISOString() });
      }

      // 批量插入，每 100 条一片，避免单次请求过大
      for (let i = 0; i < docs.length; i += 100) {
        await db.collection('activation_codes').add({ data: docs.slice(i, i + 100) });
      }

      return success({ batchId, codes }, `已生成 ${count} 个卡密`);
    }

    // 3. 管理员查询卡密列表 (排序 + 分页)
    if (action === 'list') {
      const admin = requireSuperAdmin(await requireAdmin(event, db));

      const type = String(params.type || 'BALANCE').trim();
      const batchId = params.batchId ? String(params.batchId).trim() : '';
      const sortBy = ['value', 'expireAt', 'createdAt'].includes(params.sortBy) ? params.sortBy : 'createdAt';
      const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';
      const page = Math.max(Number(params.page) || 1, 1);
      const pageSize = Math.min(Math.max(Number(params.pageSize) || 50, 1), 100);

      const whereCond = { type };
      if (batchId) whereCond.batchId = batchId;

      const coll = db.collection('activation_codes');
      const [listRes, countRes] = await Promise.all([
        coll.where(whereCond).orderBy(sortBy, sortOrder).skip((page - 1) * pageSize).limit(pageSize).get(),
        coll.where(whereCond).count()
      ]);

      const list = (listRes.data || []).map(c => ({
        id: c._id,
        code: c.code,
        status: c.status,
        type: c.type,
        benefit: c.benefit || '',
        value: c.value || 0,
        expireAt: c.expireAt ? new Date(c.expireAt).toISOString() : null,
        batchId: c.batchId || '',
        redeemedBy: c.redeemedBy || '',
        redeemedAt: c.redeemedAt ? new Date(c.redeemedAt).toISOString() : null,
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null
      }));

      return success({ list, total: countRes.total || 0 });
    }

    // 4. 管理员卡密统计 (已兑换 / 已过期 / 有效期 三类互斥)
    if (action === 'stats') {
      const admin = requireSuperAdmin(await requireAdmin(event, db));

      const type = String(params.type || 'BALANCE').trim();
      const now = new Date();
      const _ = db.command;
      const coll = db.collection('activation_codes');

      const [totalRes, usedRes, expiredRes, unusedRes] = await Promise.all([
        coll.where({ type }).count(),
        coll.where({ type, status: 'USED' }).count(),
        coll.where({ type, status: 'UNUSED', expireAt: _.lt(now) }).count(),
        coll.where({ type, status: 'UNUSED' }).count()
      ]);

      const total = totalRes.total || 0;
      const used = usedRes.total || 0;
      const expired = expiredRes.total || 0;
      const active = (unusedRes.total || 0) - expired;

      return success({ total, used, expired, active });
    }

    return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
  } catch (err) {
    console.error(`[activation][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || '卡密服务异常');
  }
};
