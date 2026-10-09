/**
 * 广告云函数 (ads)
 * 激励视频「看广告得购物额度」：平台配置单个广告位，用户观看后发额度（事务原子 + 每日防刷 + 流水）。
 * 管理员动作 getConfig/saveConfig/stats 经 adminGateway 转发；用户动作 getAdInfo/reward 由小程序直调（OPENID 定位，杜绝伪造）。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { success, fail } = require('./common/response');
const { requireAdmin } = require('./common/authMiddleware');

const CONFIG_ID = 'rewarded_video';

function requireSuperAdmin(admin) {
  if (!admin || admin.role !== 'SUPER_ADMIN') {
    throw Object.assign(new Error('仅超级管理员可管理广告配置'), { code: 'PERMISSION_DENIED' });
  }
  return admin;
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function ensureCollection(name) {
  try { await db.createCollection(name); } catch (_) {}
}

async function getConfigDoc() {
  try {
    const res = await db.collection('ad_configs').doc(CONFIG_ID).get();
    return (Array.isArray(res.data) ? res.data[0] : res.data) || null;
  } catch (_) {
    return null;
  }
}

function defaultConfig() {
  return { name: '看视频得购物额度', adUnitId: '', rewardAmount: 0, dailyLimit: 5, enabled: false };
}

exports.main = async (event) => {
  const { action, params = {} } = event;
  const openid = cloud.getWXContext().OPENID;

  try {
    // ---------------- 用户侧 ----------------
    if (action === 'getAdInfo') {
      if (!openid) return fail('AUTH_REQUIRED', '请先登录');
      const cfg = await getConfigDoc();
      const c = cfg || defaultConfig();
      const enabled = false; // No trusted server-side ad completion evidence is configured.
      const dailyLimit = Math.max(1, Number(c.dailyLimit) || 5);
      let remainingToday = dailyLimit;
      if (enabled) {
        const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get().catch(() => ({ data: [] }));
        const u = (uRes.data && uRes.data[0]) || null;
        const seen = (u && u.adRewardDate === todayStr()) ? (Number(u.adRewardCountToday) || 0) : 0;
        remainingToday = Math.max(0, dailyLimit - seen);
      }
      return success({
        enabled,
        adUnitId: c.adUnitId || '',
        rewardAmount: Number(c.rewardAmount) || 0,
        dailyLimit,
        remainingToday
      });
    }

    if (action === 'reward') return fail('AD_DISABLED', '额度奖励未开放：缺少可信服务端核验');

    if (action === 'getConfig') {
      await requireAdmin(event, db);
      const cfg = await getConfigDoc();
      return success(cfg ? {
        name: cfg.name || '',
        adUnitId: cfg.adUnitId || '',
        rewardAmount: Number(cfg.rewardAmount) || 0,
        dailyLimit: Number(cfg.dailyLimit) || 5,
        enabled: false,
        updatedAt: cfg.updatedAt || null
      } : defaultConfig());
    }

    if (action === 'saveConfig') {
      requireSuperAdmin(await requireAdmin(event, db));
      const name = String(params.name || '').trim() || '看视频得购物额度';
      const adUnitId = String(params.adUnitId || '').trim();
      const rewardAmount = Number(params.rewardAmount);
      const dailyLimit = Number(params.dailyLimit);
      if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) return fail('INVALID_PARAMS', '单次奖励额度必须为正整数(分)');
      if (!Number.isInteger(dailyLimit) || dailyLimit < 1) return fail('INVALID_PARAMS', '每日上限必须为 >=1 的整数');
      const enabled = false;

      const now = new Date();
      try {
        await db.collection('ad_configs').doc(CONFIG_ID).set({
          data: { name, adUnitId, rewardAmount, dailyLimit, enabled, updatedAt: now, createdAt: now }
        });
      } catch (e) {
        await ensureCollection('ad_configs');
        await db.collection('ad_configs').doc(CONFIG_ID).set({
          data: { name, adUnitId, rewardAmount, dailyLimit, enabled, updatedAt: now, createdAt: now }
        });
      }

      return success({ name, adUnitId, rewardAmount, dailyLimit, enabled }, '已保存');
    }

    if (action === 'stats') {
      requireSuperAdmin(await requireAdmin(event, db));
      const today = todayStr();
      const coll = db.collection('ad_reward_records');
      const [totalCountRes, totalAgg, todayCountRes, todayAgg] = await Promise.all([
        coll.count().catch(() => ({ total: 0 })),
        coll.aggregate().group({ _id: null, s: _.sum('$rewardAmount') }).end().catch(() => ({ list: [] })),
        coll.where({ date: today }).count().catch(() => ({ total: 0 })),
        coll.aggregate().match({ date: today }).group({ _id: null, s: _.sum('$rewardAmount') }).end().catch(() => ({ list: [] }))
      ]);
      const totalRow = (totalAgg.list && totalAgg.list[0]) || {};
      const todayRow = (todayAgg.list && todayAgg.list[0]) || {};
      return success({
        totalCount: Number(totalCountRes.total) || 0,
        totalRewarded: Number(totalRow.s) || 0,
        todayCount: Number(todayCountRes.total) || 0,
        todayRewarded: Number(todayRow.s) || 0
      });
    }

    return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
  } catch (err) {
    console.error(`[ads][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || '广告服务异常');
  }
};
