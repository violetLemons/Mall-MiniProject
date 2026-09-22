const cloud = require('wx-server-sdk'); cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce');
const { success, fail } = require('./common/response');
const { requireAdmin, requirePermission } = require('./common/authMiddleware');
exports.main = async event => {
  try {
    const admin = await requireAdmin(event, db), { action, params = {} } = event;
    if (['listLogs', 'getLogs'].includes(action)) {
      requirePermission(admin, 'inventory.view');
      const query = {}, page = c.integer(params.page || 1, '页码', 1, 10000), pageSize = c.integer(params.pageSize || 20, '每页数量', 1, 50);
      if (admin.merchantId) query.merchantId = admin.merchantId;
      for (const k of ['skuId', 'productId']) if (params[k]) query[k] = c.text(params[k], k);
      return success({ list: (await db.collection('inventory_logs').where(query).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()).data,
        total: (await db.collection('inventory_logs').where(query).count()).total, page, pageSize });
    }
    requirePermission(admin, 'inventory.update');
    if (!['adjustStock', 'updateSkuStock'].includes(action)) throw c.error('ACTION_NOT_FOUND', '请通过商品规格管理修改价格');
    const id = c.text(params.skuId, '规格ID'), targetStock = c.integer(params.targetStock, '目标库存');
    return success(await c.transaction(db, async tx => {
      const sku = await c.get(tx, 'product_skus', id);
      if (!sku) throw c.error('SKU_NOT_FOUND', '规格不存在');
      if (targetStock < (sku.lockedStock || 0)) throw c.error('LOCKED_STOCK', '实物库存不能小于已锁库存');
      const p = await c.get(tx, 'products', sku.productId), delta = targetStock - sku.stock;
      if (admin.merchantId && (p.merchantId || null) !== admin.merchantId) throw c.error('PERMISSION_DENIED', '无权操作其他商家的商品库存');
      await tx.collection('product_skus').doc(id).update({ data: { stock: targetStock, updatedAt: new Date() } });
      await tx.collection('products').doc(p._id).update({ data: { totalStock: (p.totalStock || 0) + delta } });
      const logId = c.key(id, Date.now(), Math.random());
      await tx.collection('inventory_logs').doc(logId).set({ data: { skuId: id, productId: p._id, delta,
        merchantId: p.merchantId || null,
        beforeStock: sku.stock, afterStock: targetStock, reason: 'ADMIN_ADJUST', remark: c.text(params.reason || '盘点', '原因'), adminId: admin.adminId, adminUsername: admin.username, createdAt: new Date() } });
      return { beforeStock: sku.stock, afterStock: targetStock, delta, logId };
    }));
  } catch (e) { return fail(e.code, e.message); }
};
