const cloud = require('wx-server-sdk'); cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database(), c = require('./common/commerce');
const { success, fail } = require('./common/response');
const { requireAdmin, requirePermission } = require('./common/authMiddleware');
const wxOrderShippingService = require('./common/wxOrderShippingService');

async function syncShipping(order, extra = {}) {
  const isPickup = order.deliveryType === 'PICKUP' || order.deliveryType === 'pickup';
  if (isPickup) {
    return wxOrderShippingService.syncPickupCompletion(cloud, db, order);
  } else {
    return wxOrderShippingService.syncExpressShipping(cloud, db, order, extra);
  }
}

// 解析订单：优先按父单ID查 orders，否则按子订单ID解析父支付单
async function resolveParentOrder(targetDb, id) {
  let order = await c.get(targetDb, 'orders', id);
  if (order) return { order, parentOrderId: id };
  const sub = await c.get(targetDb, 'merchant_orders', id);
  if (sub) {
    const parentOrderId = sub.parentOrderId || sub._id;
    order = await c.get(targetDb, 'orders', parentOrderId);
    if (order) return { order, parentOrderId };
  }
  return { order: null, parentOrderId: id };
}

// 商家归属校验：商家仅能操作含本商家商品的支付单
function assertMerchantOwnsOrder(admin, order) {
  if (admin.merchantId && !((order.merchantIds || []).includes(admin.merchantId))) {
    throw c.error('PERMISSION_DENIED', '无权操作其他商家的订单');
  }
}

// 子订单发货后：汇总父支付单下所有子订单的物流单号，上报微信多包裹发货
async function syncParentExpressShipping(parentOrderId) {
  if (!parentOrderId) return { status: 'synced', message: '无父支付单，跳过微信上报' };
  const parent = await c.get(db, 'orders', parentOrderId);
  if (!parent) return { status: 'failed', message: '父支付单不存在' };
  if (parent.isTest) return { status: 'synced', message: '测试订单跳过微信上报', isTest: true };

  const siblings = (await db.collection('merchant_orders').where({ parentOrderId }).get()).data || [];
  const allShipments = [];
  let allDone = true;
  const doneStatus = ['SHIPPED', 'COMPLETED', 'REFUNDED', 'CANCELLED'];
  for (const s of siblings) {
    if (!doneStatus.includes(s.status)) allDone = false;
    for (const sh of (s.shipments || [])) allShipments.push(sh);
  }
  if (allShipments.length === 0) return { status: 'failed', message: '暂无有效物流单号可上报' };

  return wxOrderShippingService.syncExpressShipping(cloud, db, parent, {
    shipments: allShipments,
    isAllDelivered: allDone
  });
}

// 商户名称映射：merchantId -> 名称（独立 name 字段，未设置则为空串，由前端显示占位）
async function getMerchantNameMap(targetDb) {
  const res = await targetDb.collection('admins').where({ role: 'MERCHANT' }).field({ merchantId: true, name: true }).limit(1000).get();
  const map = {};
  for (const a of (res.data || [])) {
    if (a.merchantId) map[a.merchantId] = a.name || '';
  }
  return map;
}

exports.main = async event => {
  try {
    const { action, params = {} } = event;
    const admin = await requireAdmin(event, db);

    // 1. 订单列表查询 (统一子订单视图：商家仅看自己，平台看全量)
    if (action === 'list') {
      requirePermission(admin, 'order.view');
      const page = c.integer(params.page || 1, '页码', 1, 10000), pageSize = c.integer(params.pageSize || 20, '每页数量', 1, 1000);

      const conds = [];
      if (admin.merchantId) conds.push({ merchantId: admin.merchantId });
      else if (params.merchantId) conds.push({ merchantId: c.text(params.merchantId, '商户ID', 1, 50) });
      if (Array.isArray(params.statuses) && params.statuses.length > 0) {
        conds.push({ status: db.command.in(params.statuses.map(s => c.text(s, '状态', 1, 30))) });
      } else if (params.status && params.status !== 'ALL') {
        conds.push({ status: c.text(params.status, '状态', 1, 30) });
      }
      if (params.deliveryType && params.deliveryType !== 'ALL') conds.push({ deliveryType: c.text(params.deliveryType, '配送方式', 1, 20) });

      // 关键字模糊搜索：子/父订单号、收货人姓名、手机号
      const keyword = (params.keyword ? String(params.keyword).trim() : '') || (params.orderNo && params.orderNo !== 'ALL' ? String(params.orderNo).trim() : '');
      if (keyword) {
        const rx = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
        conds.push(db.command.or([
          { subOrderNo: rx },
          { parentOrderNo: rx },
          { 'shippingAddress.name': rx },
          { 'shippingAddress.phone': rx }
        ]));
      }

      // 时间范围筛选（按下单时间 createdAt）
      const startTime = params.startTime ? new Date(params.startTime) : null;
      const endTime = params.endTime ? new Date(params.endTime) : null;
      const hasStart = startTime && !isNaN(startTime.getTime());
      const hasEnd = endTime && !isNaN(endTime.getTime());
      if (hasStart && hasEnd) {
        conds.push({ createdAt: db.command.gte(startTime).and(db.command.lte(endTime)) });
      } else if (hasStart) {
        conds.push({ createdAt: db.command.gte(startTime) });
      } else if (hasEnd) {
        conds.push({ createdAt: db.command.lte(endTime) });
      }

      const query = conds.length === 0 ? {} : (conds.length === 1 ? conds[0] : db.command.and(conds));

      const nameMap = await getMerchantNameMap(db);
      const total = (await db.collection('merchant_orders').where(query).count()).total;
      const docs = (await db.collection('merchant_orders').where(query).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()).data;
      const list = docs.map(o => ({ ...o, id: o._id || o.id, orderNo: o.subOrderNo || o.orderNo, payAmount: o.totalAmount || o.payAmount || 0, merchantName: nameMap[o.merchantId] || '' }));

      return success({ list, total, page, pageSize, hasMore: page * pageSize < total });
    }

    // 商户下拉列表 (平台按商户筛选订单用；商家仅返回自身)
    if (action === 'merchants') {
      requirePermission(admin, 'order.view');
      if (admin.merchantId) return success([{ merchantId: admin.merchantId, name: admin.name || '' }]);
      const res = await db.collection('admins').where({ role: 'MERCHANT' }).field({ merchantId: true, name: true }).limit(1000).get();
      const list = (res.data || [])
        .filter(a => a.merchantId)
        .map(a => ({ merchantId: a.merchantId, name: a.name || '' }))
        .sort((x, y) => x.merchantId.localeCompare(y.merchantId));
      return success(list);
    }

    // 2. 微信发货状态主动反向对账 (单单对账 / 批量近期对账)
    if (action === 'syncWithWechat') {
      requirePermission(admin, 'order.ship');
      if (params.orderId) {
        const { order } = await resolveParentOrder(db, params.orderId);
        if (!order) throw c.error('ORDER_NOT_FOUND', '订单不存在');
        assertMerchantOwnsOrder(admin, order);
        const res = await wxOrderShippingService.reconcileOrderWithWechat(cloud, db, order);
        return success(res, res.message || '微信订单发货状态对账完成');
      } else {
        // 批量对账近期待发货或异常订单（安全限制最多 15 条，避免高频全库轮询）；商家仅对账本商家支付单
        const orCond = db.command.or([
          { status: 'PAID' },
          { 'wxShippingSync.status': 'failed' },
          { 'wxShippingSync.status': 'FAILED' },
          { 'wxShippingSync.status': 'conflict' },
          { 'wxShippingSync.status': 'CONFLICT' }
        ]);
        const cond = admin.merchantId ? db.command.and([{ merchantIds: admin.merchantId }, orCond]) : orCond;
        const candidateRes = await db.collection('orders')
          .where(cond)
          .orderBy('createdAt', 'desc')
          .limit(15)
          .get();
        const batchResults = await wxOrderShippingService.reconcileBatchOrders(cloud, db, candidateRes.data || []);
        return success({ results: batchResults, count: batchResults.length }, '近期订单微信发货状态对账完成');
      }
    }

    // 3. 物流信息冲突人工裁决
    if (action === 'resolveShippingConflict') {
      requirePermission(admin, 'order.ship');
      const orderId = c.text(params.orderId, '订单ID');
      const { order } = await resolveParentOrder(db, orderId);
      if (!order) throw c.error('ORDER_NOT_FOUND', '订单不存在');
      assertMerchantOwnsOrder(admin, order);
      const resolution = params.resolution || 'USE_WECHAT';
      const res = await wxOrderShippingService.resolveShippingConflict(cloud, db, order, resolution);
      return success(res, res.message);
    }

    const id = c.text(params.orderId, '订单ID');

    // 子订单发货 (合并支付下按子订单独立履约，支持一个子订单多个快递单号)
    if (action === 'shipSubOrder') {
      requirePermission(admin, 'order.ship');
      const subOrderId = c.text(params.orderId, '子订单ID');
      const trackingNo = c.text(params.trackingNo, '物流单号', 6, 40);
      const logisticsCompany = String(params.logisticsCompany || params.expressCompany || '极速快递').trim();
      const expressCompany = String(params.expressCompany || logisticsCompany).trim();

      const result = await c.transaction(db, async tx => {
        const sub = await c.get(tx, 'merchant_orders', subOrderId);
        if (!sub) throw c.error('ORDER_NOT_FOUND', '子订单不存在');
        if (admin.merchantId && (sub.merchantId || null) !== admin.merchantId) throw c.error('PERMISSION_DENIED', '无权操作其他商家的订单');
        if (!['PAID', 'SHIPPED'].includes(sub.status)) throw c.error('INVALID_ORDER_STATUS', '仅已付款或已发货的子订单可发货');
        const shipNow = new Date();
        const wasShipped = sub.status === 'SHIPPED';
        const shipments = [...(sub.shipments || [])];
        shipments.push({ trackingNo, logisticsCompany, expressCompany, shippedAt: shipNow });
        await tx.collection('merchant_orders').doc(subOrderId).update({ data: { status: 'SHIPPED', shipments, ...(wasShipped ? {} : { shippedAt: shipNow }), updatedAt: shipNow } });

        // 聚合父支付单：所有子订单均已履约(发货/完成/退款/取消)则父订单 SHIPPED (已 SHIPPED 不再覆盖首次发货时间)
        if (sub.parentOrderId) {
          const siblings = await tx.collection('merchant_orders').where({ parentOrderId: sub.parentOrderId }).get();
          const done = ['SHIPPED', 'COMPLETED', 'REFUNDED', 'CANCELLED'];
          const allDone = (siblings.data || []).every(s => done.includes(s.status));
          if (allDone) {
            const parent = await c.get(tx, 'orders', sub.parentOrderId);
            if (parent && parent.status !== 'SHIPPED') {
              await tx.collection('orders').doc(sub.parentOrderId).update({ data: { status: 'SHIPPED', orderStatus: 'SHIPPED', shippingStatus: 'SHIPPED', shippedAt: shipNow, shippingTime: shipNow, updatedAt: shipNow } });
            }
          }
        }
        return { subOrderId, shipments };
      });

      // 发货完成后：汇总父支付单下所有子订单物流单号，上报微信多包裹发货
      const shippedSub = await c.get(db, 'merchant_orders', subOrderId);
      const syncResult = shippedSub ? await syncParentExpressShipping(shippedSub.parentOrderId) : null;
      return success({ subOrderId, shipments: result.shipments, shippingSync: syncResult }, '子订单发货成功');
    }

    // 商家审核退款申请 (同意 -> REFUNDING，拒绝 -> 回退)
    if (action === 'reviewRefund') {
      requirePermission(admin, 'order.ship');
      const subOrderId = c.text(params.orderId, '子订单ID');
      const decision = params.decision === 'REJECT' ? 'REJECT' : 'APPROVE';
      const sub = await c.get(db, 'merchant_orders', subOrderId);
      if (!sub) throw c.error('ORDER_NOT_FOUND', '子订单不存在');
      if (admin.merchantId && (sub.merchantId || null) !== admin.merchantId) throw c.error('PERMISSION_DENIED', '无权操作其他商家的订单');
      if (sub.status !== 'REFUND_PENDING') throw c.error('INVALID_ORDER_STATUS', '子订单不在待审核状态');
      const refundNo = sub.refundNo;
      if (decision === 'REJECT') {
        const revertStatus = sub.shippedAt ? 'SHIPPED' : 'PAID';
        await db.collection('merchant_orders').doc(subOrderId).update({ data: { status: revertStatus, refundNo: '', updatedAt: new Date() } });
        if (refundNo) await db.collection('refund_records').doc(refundNo).update({ data: { status: 'REJECTED', reviewedAt: new Date(), updatedAt: new Date() } });
        return success({ status: revertStatus }, '已拒绝退款申请');
      }
      await db.collection('merchant_orders').doc(subOrderId).update({ data: { status: 'REFUNDING', updatedAt: new Date() } });
      if (refundNo) await db.collection('refund_records').doc(refundNo).update({ data: { status: 'APPROVED', reviewedAt: new Date(), updatedAt: new Date() } });
      return success({ status: 'REFUNDING' }, '已同意退款，等待平台执行');
    }

    // 平台执行退款 (真实微信部分退款 + 回退销量)
    if (action === 'executeRefund') {
      requirePermission(admin, 'order.ship');
      if (admin.merchantId) throw c.error('PERMISSION_DENIED', '仅平台可执行退款');
      const subOrderId = c.text(params.orderId, '子订单ID');
      const sub = await c.get(db, 'merchant_orders', subOrderId);
      if (!sub) throw c.error('ORDER_NOT_FOUND', '子订单不存在');
      if (sub.status !== 'REFUNDING') throw c.error('INVALID_ORDER_STATUS', '子订单不在待执行退款状态');

      // TODO: 调用微信支付 API v3 部分退款 /v3/refund/domestic/refunds
      // out_trade_no = 支付单 orderNo, out_refund_no = refund_records.outRefundNo, amount.refund = 子订单 refundFee

      // 余额抵扣部分退还到用户购物额度（无需微信 API）；现金部分仍 TODO
      const balanceRefund = Number(sub.balanceAmount) || 0;
      let refundUserId = null;
      if (balanceRefund > 0 && sub.userId) {
        const uRes = await db.collection('users').where({ _openid: sub.userId }).limit(1).get().catch(() => ({ data: [] }));
        refundUserId = (uRes.data && uRes.data[0] && uRes.data[0]._id) || null;
      }

      const now = new Date();
      await c.transaction(db, async tx => {
        for (const item of (sub.items || [])) {
          const p = await c.get(tx, 'products', item.productId);
          if (p) await tx.collection('products').doc(item.productId).update({ data: { sales: Math.max(0, (p.sales || 0) - item.count), updatedAt: now } });
        }
        if (balanceRefund > 0 && refundUserId) {
          const u = await c.get(tx, 'users', refundUserId);
          if (u) await tx.collection('users').doc(refundUserId).update({ data: { balance: (Number(u.balance) || 0) + balanceRefund, updatedAt: now } });
        }
        await tx.collection('merchant_orders').doc(subOrderId).update({ data: { status: 'REFUNDED', refundedAt: now, updatedAt: now } });
        if (sub.refundNo) await tx.collection('refund_records').doc(sub.refundNo).update({ data: { status: 'SUCCESS', refundedAt: now, updatedAt: now } });
        if (sub.parentOrderId) {
          const parent = await c.get(tx, 'orders', sub.parentOrderId);
          if (parent) await tx.collection('orders').doc(sub.parentOrderId).update({ data: { refundedAmount: (parent.refundedAmount || 0) + (sub.totalAmount || 0), updatedAt: now } });
        }
      });

      return success({ status: 'REFUNDED' }, '退款已执行');
    }

    if (action === 'cancel') {
      requirePermission(admin, 'order.cancel');
      const { order, parentOrderId } = await resolveParentOrder(db, id);
      if (!order) throw c.error('ORDER_NOT_FOUND', '订单不存在');
      assertMerchantOwnsOrder(admin, order);
      const res = await c.cancelOrder(db, cloud, parentOrderId, null, '管理员取消');
      // 取消成功后同步该支付单下所有子订单为已取消 (拆单后买家/商家均以子订单为准)
      if (res && res.status === 'CANCELLED') {
        try {
          const siblings = await db.collection('merchant_orders').where({ parentOrderId }).get();
          for (const s of (siblings.data || [])) {
            await db.collection('merchant_orders').doc(s._id).update({ data: { status: 'CANCELLED', updatedAt: new Date() } });
          }
        } catch (_) {}
      }
      return success(res);
    }

    if (action === 'queryWxShipping') {
      requirePermission(admin, 'order.view');
      const { order } = await resolveParentOrder(db, id);
      if (!order) throw c.error('ORDER_NOT_FOUND', '订单不存在');
      assertMerchantOwnsOrder(admin, order);
      return success(await wxOrderShippingService.queryWxShippingStatus(cloud, order));
    }

    requirePermission(admin, action === 'retryShippingSync' ? 'order.ship' : 'order.pickup');

    const { order: parentOrder, parentOrderId } = await resolveParentOrder(db, id);
    if (!parentOrder) throw c.error('ORDER_NOT_FOUND', '订单不存在');
    assertMerchantOwnsOrder(admin, parentOrder);

    // 微信发货信息主动重新上报 (快递按支付单聚合所有子订单物流，自提走自提履约上报)
    if (action === 'retryShippingSync') {
      const isPickup = parentOrder.deliveryType === 'PICKUP' || parentOrder.deliveryType === 'pickup';
      const syncResult = isPickup ? await syncShipping(parentOrder) : await syncParentExpressShipping(parentOrderId);
      const isOk = syncResult.status === 'synced' || syncResult.status === 'SUCCESS';
      return success({
        shippingSyncStatus: isOk ? 'SHIPPING_SYNC_SUCCESS' : 'SHIPPING_SYNC_FAILED',
        syncStatus: syncResult.status,
        syncResult
      }, syncResult.message || '操作成功');
    }

    // 自提履约 (备货/核销/完成交付) —— 平台操作支付单，并同步其下所有子订单状态
    await c.transaction(db, async tx => {
      const order = await c.get(tx, 'orders', parentOrderId);
      if (!order) throw c.error('ORDER_NOT_FOUND', '订单不存在');
      const patch = { updatedAt: new Date() };
      const isPickup = order.deliveryType === 'PICKUP' || order.deliveryType === 'pickup';

      if (action === 'preparePickup') {
        if (order.status !== 'PAID' || !isPickup) throw c.error('INVALID_ORDER_STATUS', '仅已付款的自提订单可备货');
        Object.assign(patch, { status: 'READY_FOR_PICKUP', orderStatus: 'READY_FOR_PICKUP', 'pickupInfo.pickupStatus': 'READY' });
      } else if (['verifyPickup', 'completePickup', 'confirmPickup'].includes(action)) {
        if (!['PAID', 'WAITING_PICKUP', 'READY_FOR_PICKUP'].includes(order.status) || !isPickup) throw c.error('INVALID_ORDER_STATUS', '仅已付款或待自提的自提订单可确认完成交付');
        const completeNow = new Date();
        Object.assign(patch, {
          status: 'COMPLETED',
          orderStatus: 'COMPLETED',
          completedAt: completeNow,
          completeTime: completeNow,
          'pickupInfo.pickupStatus': 'PICKED'
        });
      } else throw c.error('ACTION_NOT_FOUND', '操作不存在');

      await tx.collection('orders').doc(parentOrderId).update({ data: patch });

      // 同步该支付单下所有子订单的履约状态 (拆单后买家/商家均以子订单为准)
      try {
        const siblings = await tx.collection('merchant_orders').where({ parentOrderId }).get();
        for (const s of (siblings.data || [])) {
          await tx.collection('merchant_orders').doc(s._id).update({ data: { status: patch.status, updatedAt: new Date() } });
        }
      } catch (_) {}

      await tx.collection('operation_logs').doc(c.key(parentOrderId, action)).set({ data: { adminId: admin.adminId, adminUsername: admin.username, action, resourceType: 'ORDER', resourceId: parentOrderId, createdAt: new Date() } });
    });

    if (action === 'preparePickup') return success(null);

    // 自提完成交付后同步微信
    const order = await c.get(db, 'orders', parentOrderId);
    if (!order || !['SHIPPED', 'COMPLETED'].includes(order.status)) throw c.error('INVALID_ORDER_STATUS', '订单未完成交付');
    const syncResult = await syncShipping(order);
    const isOk = syncResult.status === 'synced' || syncResult.status === 'SUCCESS';
    return success({
      shippingSyncStatus: isOk ? 'SHIPPING_SYNC_SUCCESS' : 'SHIPPING_SYNC_FAILED',
      syncStatus: syncResult.status,
      syncResult
    }, syncResult.message || '操作成功');
  } catch (e) { return fail(e.code, e.message); }
};
