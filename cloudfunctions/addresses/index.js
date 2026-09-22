const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function key(...parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

function text(value, name, min = 1, max = 200) {
  const s = String(value || '').trim();
  if (s.length < min || s.length > max) throw err('INVALID_PARAMS', `${name}格式不正确 (需 ${min}~${max} 字)`);
  return s;
}

function success(data = null, message = '操作成功') {
  return {
    success: true,
    code: 'OK',
    message,
    data,
    requestId: (crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random())),
    serverTime: Date.now()
  };
}

function fail(code = 'SYSTEM_ERROR', message = '系统内部错误') {
  return {
    success: false,
    code: (typeof code === 'string' && /^[A-Z_]{3,50}$/.test(code)) ? code : 'SYSTEM_ERROR',
    message: message || '服务暂时不可用，请稍后重试',
    data: null,
    requestId: (crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random())),
    serverTime: Date.now()
  };
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (_) {}
}

async function safeGet(collection, docId) {
  try {
    const res = await db.collection(collection).doc(docId).get();
    return Array.isArray(res.data) ? res.data[0] || null : res.data || null;
  } catch (e) {
    const msg = String(e?.message || e?.errMsg || '');
    if (/not.?exist|not found|不存在/i.test(msg)) return null;
    return null;
  }
}

function validateAddress(input) {
  if (!input || typeof input !== 'object') throw err('INVALID_ADDRESS', '请填写收货地址');
  const name = text(input.name, '收货人姓名', 1, 30);
  const phone = text(input.phone, '手机号码', 11, 11);
  if (!/^1[3-9]\d{9}$/.test(phone)) throw err('INVALID_PHONE', '请输入有效的11位手机号码');
  const province = text(input.province, '省份', 1, 50);
  const city = text(input.city, '城市', 1, 50);
  const district = String(input.district || '').trim();
  const detail = text(input.detail, '详细地址', 1, 300);
  const tag = String(input.tag || '').trim();
  return { name, phone, province, city, district, detail, tag };
}

exports.main = async (event, context) => {
  try {
    const { action, params = {} } = event || {};
    const wxContext = cloud.getWXContext();
    const userId = wxContext.OPENID;
    if (!userId) throw err('AUTH_REQUIRED', '请先登录');

    // 1. 地址列表
    if (action === 'list') {
      let rows = [];
      try {
        const queryRes = await db.collection('addresses')
          .where({ userId })
          .orderBy('updatedAt', 'desc')
          .limit(50)
          .get();
        rows = queryRes.data || [];
      } catch (listErr) {
        console.warn('[addresses:list] query failed, retrying without sort:', listErr);
        try {
          const fallbackRes = await db.collection('addresses')
            .where({ userId })
            .limit(50)
            .get();
          rows = (fallbackRes.data || []).sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
        } catch (dbErr) {
          if (/not.?exist|not found/i.test(String(dbErr.message))) {
            await ensureCollection('addresses');
            await ensureCollection('address_meta');
            rows = [];
          } else {
            throw dbErr;
          }
        }
      }

      const meta = await safeGet('address_meta', userId);
      const defaultId = meta?.defaultAddressId || rows.find(item => item.isDefault)?._id || rows[0]?._id;

      const data = rows.map(item => {
        const id = item._id || item.id;
        return {
          ...item,
          id,
          isDefault: id === defaultId
        };
      });
      return success(data);
    }

    // 2. 保存地址 (新增或修改)
    if (action === 'save') {
      const normalized = validateAddress(params);
      const id = params.id ? text(params.id, '地址ID', 1, 100) : key(userId, Date.now(), Math.random());

      if (params.id) {
        const old = await safeGet('addresses', id);
        if (old && old.userId !== userId) {
          throw err('PERMISSION_DENIED', '无权修改此收货地址');
        }
      }

      const meta = await safeGet('address_meta', userId);
      const isFirst = !meta?.defaultAddressId;
      const willBeDefault = params.isDefault === true || isFirst;
      const defaultAddressId = willBeDefault ? id : meta?.defaultAddressId;

      const addrData = {
        ...normalized,
        userId,
        isDefault: willBeDefault,
        updatedAt: new Date()
      };
      delete addrData._id;
      delete addrData.id;

      try {
        await db.collection('addresses').doc(id).set({ data: addrData });
      } catch (writeErr) {
        if (/not.?exist|not found/i.test(String(writeErr.message))) {
          await ensureCollection('addresses');
          await db.collection('addresses').doc(id).set({ data: addrData });
        } else {
          throw writeErr;
        }
      }

      if (willBeDefault) {
        try {
          await db.collection('address_meta').doc(userId).set({
            data: { defaultAddressId: id, updatedAt: new Date() }
          });
        } catch (metaErr) {
          if (/not.?exist|not found/i.test(String(metaErr.message))) {
            await ensureCollection('address_meta');
            await db.collection('address_meta').doc(userId).set({
              data: { defaultAddressId: id, updatedAt: new Date() }
            });
          }
        }
      }

      return success({ ...normalized, id, isDefault: willBeDefault });
    }

    // 3. 删除地址
    if (action === 'delete') {
      const id = text(params.id, '地址ID', 1, 100);
      const old = await safeGet('addresses', id);
      if (old && old.userId !== userId) {
        throw err('PERMISSION_DENIED', '无权删除此地址');
      }

      await db.collection('addresses').doc(id).remove();

      // 若删除的是默认地址，自动设置剩余第一条为默认地址
      const meta = await safeGet('address_meta', userId);
      if (meta?.defaultAddressId === id) {
        try {
          const remain = await db.collection('addresses').where({ userId }).limit(1).get();
          const nextDefaultId = remain.data && remain.data.length > 0 ? (remain.data[0]._id || remain.data[0].id) : null;
          await db.collection('address_meta').doc(userId).set({
            data: { defaultAddressId: nextDefaultId, updatedAt: new Date() }
          });
        } catch (_) {}
      }

      return success({ id });
    }

    throw err('ACTION_NOT_FOUND', `未知的地址操作: ${action}`);
  } catch (e) {
    console.error('[addresses error]:', e);
    return fail(e.code, e.message);
  }
};
