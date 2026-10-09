const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce');
const { success, fail } = require('./common/response');

exports.main = async event => {
  try {
    const { action, params = {} } = event || {}, userId = cloud.getWXContext().OPENID;
    if (!userId) throw c.error('AUTH_REQUIRED', '请先登录');
    if (action === 'list') {
      const rows = (await db.collection('addresses').where({ userId }).orderBy('updatedAt', 'desc').limit(50).get()).data;
      const meta = await c.get(db, 'address_meta', userId);
      const defaultId = rows.some(r => r._id === meta?.defaultAddressId) ? meta.defaultAddressId : rows[0]?._id;
      return success(rows.map(r => ({ ...r, id: r._id, isDefault: r._id === defaultId })));
    }
    if (!['save', 'delete'].includes(action)) throw c.error('ACTION_NOT_FOUND', '地址操作不存在');
    const id = params.id ? c.text(params.id, '地址ID', 1, 100) : c.key(userId, require('crypto').randomUUID());
    if (action === 'delete' && !params.id) throw c.error('INVALID_PARAMS', '缺少地址ID');
    const normalized = action === 'save' ? { ...c.address(params), tag: params.tag ? c.text(params.tag, '标签', 1, 20) : '' } : null;
    return success(await c.transaction(db, async tx => {
      const old = await c.get(tx, 'addresses', id);
      if (old && old.userId !== userId) throw c.error('PERMISSION_DENIED', '无权操作此地址');
      if (params.id && !old) throw c.error('ADDRESS_NOT_FOUND', '地址不存在');
      const meta = await c.get(tx, 'address_meta', userId);
      if (action === 'save' && !old && (await tx.collection('addresses').where({ userId }).limit(50).get()).data.length >= 50) throw c.error('ADDRESS_LIMIT', '最多保存50个地址，请先删除不用的地址');
      if (action === 'delete') {
        await tx.collection('addresses').doc(id).remove();
        if (meta?.defaultAddressId === id) {
          const rows = (await tx.collection('addresses').where({ userId }).limit(1).get()).data;
          await tx.collection('address_meta').doc(userId).set({ data: { defaultAddressId: rows[0]?._id || null, updatedAt: new Date() } });
        }
        return { id };
      }
      const isDefault = params.isDefault === true || !meta?.defaultAddressId || meta.defaultAddressId === id;
      const row = { ...normalized, userId, isDefault, createdAt: old?.createdAt || new Date(), updatedAt: new Date() };
      await tx.collection('addresses').doc(id).set({ data: row });
      if (isDefault) await tx.collection('address_meta').doc(userId).set({ data: { defaultAddressId: id, updatedAt: new Date() } });
      return { ...normalized, id, isDefault };
    }));
  } catch (e) { return fail(e.code, e.message); }
};
