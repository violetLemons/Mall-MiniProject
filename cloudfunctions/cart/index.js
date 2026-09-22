/**
 * 购物车云函数 (cart)
 * 纯自包含实现，杜绝外部子模块路径依赖
 */
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
  if (s.length < min || s.length > max) throw err('INVALID_PARAMS', `${name}格式不正确`);
  return s;
}

function integer(value, name, min = 0, max = 100000000) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw err('INVALID_PARAMS', `${name}必须为 ${min}~${max} 的整数`);
  return n;
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

async function safeDocGet(collection, docId) {
  try {
    const res = await db.collection(collection).doc(docId).get();
    return Array.isArray(res.data) ? res.data[0] || null : res.data || null;
  } catch (e) {
    return null;
  }
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (_) {}
}

exports.main = async (event) => {
  const { action, params = {} } = event || {};
  try {
    const userId = cloud.getWXContext().OPENID;
    if (!userId) throw err('AUTH_REQUIRED', '请先登录');

    // 1. 获取购物车
    if (action === 'getCart') {
      let rows = [];
      try {
        const res = await db.collection('carts')
          .where({ userId })
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get();
        rows = res.data || [];
      } catch (getErr) {
        console.warn('[cart:getCart] orderBy failed, retrying without sort:', getErr);
        try {
          const res = await db.collection('carts')
            .where({ userId })
            .limit(100)
            .get();
          rows = res.data || [];
        } catch (colErr) {
          await ensureCollection('carts');
          rows = [];
        }
      }

      const items = [];
      for (const row of rows) {
        const sku = await safeDocGet('product_skus', row.skuId);
        const p = sku ? await safeDocGet('products', sku.productId) : null;
        const availableStock = sku ? Math.max(0, sku.stock - (sku.lockedStock || 0)) : 0;
        items.push({
          id: row._id,
          cartId: row._id,
          productId: p?._id || row.productId,
          skuId: row.skuId,
          title: p?.name || '商品已失效',
          skuText: sku ? `${sku.colorName || ''} / ${sku.size}` : '规格已失效',
          image: sku?.colorImage || p?.cover || '',
          price: sku?.price || 0,
          count: row.count,
          selected: row.selected !== false,
          availableStock,
          inStock: availableStock >= row.count && sku?.status === 'ACTIVE',
          isOnSale: p?.status === 'ON_SALE'
        });
      }
      return success(items);
    }

    // 2. 添加到购物车
    if (action === 'addCart') {
      const skuId = text(params.skuId, '规格ID', 1, 100);
      const addCount = integer(params.count, '数量', 1, 5);
      const id = key(userId, skuId);

      const [sku, oldCart] = await Promise.all([
        safeDocGet('product_skus', skuId),
        safeDocGet('carts', id)
      ]);

      if (!sku || sku.status !== 'ACTIVE') throw err('SKU_NOT_FOUND', '商品规格不存在或已停售');
      const p = await safeDocGet('products', sku.productId);
      if (!p || p.status !== 'ON_SALE' || p.deletedAt) throw err('PRODUCT_OFF_SALE', '商品已下架');

      const finalCount = Math.min(5, (oldCart?.count || 0) + addCount);
      const availableStock = Math.max(0, sku.stock - (sku.lockedStock || 0));
      if (finalCount > availableStock) throw err('OUT_OF_STOCK', '可售库存不足');

      const cartData = {
        userId,
        skuId: sku._id,
        productId: p._id,
        count: finalCount,
        selected: true,
        createdAt: oldCart?.createdAt || new Date(),
        updatedAt: new Date()
      };
      delete cartData._id;

      try {
        await db.collection('carts').doc(id).set({ data: cartData });
      } catch (writeErr) {
        await ensureCollection('carts');
        await db.collection('carts').doc(id).set({ data: cartData });
      }
      return success({ cartId: id, count: finalCount });
    }

    // 3. 更新数量
    if (action === 'updateCount') {
      const cartId = text(params.cartId, '购物车ID', 1, 100);
      const newCount = integer(params.count, '数量', 1, 5);
      const row = await safeDocGet('carts', cartId);
      if (!row || row.userId !== userId) throw err('PERMISSION_DENIED', '购物车项不存在');

      const sku = await safeDocGet('product_skus', row.skuId);
      const availableStock = sku ? Math.max(0, sku.stock - (sku.lockedStock || 0)) : 0;
      if (newCount > availableStock) throw err('OUT_OF_STOCK', '可售库存不足');

      await db.collection('carts').doc(cartId).update({ data: { count: newCount, updatedAt: new Date() } });
      return success({ cartId, count: newCount });
    }

    // 4. 选中 / 取消选中
    if (action === 'selectCart') {
      const cartId = text(params.cartId, '购物车ID', 1, 100);
      if (typeof params.selected !== 'boolean') throw err('INVALID_PARAMS', '选择状态无效');
      const row = await safeDocGet('carts', cartId);
      if (!row || row.userId !== userId) throw err('PERMISSION_DENIED', '购物车项不存在');

      await db.collection('carts').doc(cartId).update({ data: { selected: params.selected, updatedAt: new Date() } });
      return success({ cartId, selected: params.selected });
    }

    // 5. 移除单项
    if (action === 'removeCart') {
      const cartId = text(params.cartId, '购物车ID', 1, 100);
      const row = await safeDocGet('carts', cartId);
      if (!row || row.userId !== userId) throw err('PERMISSION_DENIED', '购物车项不存在');

      await db.collection('carts').doc(cartId).remove();
      return success({ cartId });
    }

    // 6. 清空已选
    if (action === 'clearSelected') {
      try {
        const selRes = await db.collection('carts').where({ userId, selected: true }).get();
        for (const item of (selRes.data || [])) {
          await db.collection('carts').doc(item._id).remove().catch(() => {});
        }
      } catch (_) {}
      return success({ cleared: true });
    }

    throw err('ACTION_NOT_FOUND', `未知的购物车操作: ${action}`);
  } catch (e) {
    console.error('[cart error]:', e);
    return fail(e.code, e.message);
  }
};
