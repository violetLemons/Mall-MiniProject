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

exports.main = async event => {
  try {
    const { action, params = {} } = event;
    const admin = await requireAdmin(event, db);

    // 1. 订单列表查询 (统一子订单视图：商家仅看自己，平台看全量)
    if (action === 'list') {
      requirePermission(admin, 'order.view');
      const page = c.integer(params.page || 1, '页码', 1, 10000), pageSize = c.integer(params.pageSize || 20, '每页数量', 1, 50);

      const query = {};
      if (admin.merchantId) query.merchantId = admin.merchantId;
      if (params.status && params.status !== 'ALL') query.status = c.text(params.status, '状态', 1, 30);
      if (params.deliveryType && params.deliveryType !== 'ALL') query.deliveryType = c.text(params.deliveryType, '配送方式', 1, 20);
      if (params.orderNo && params.orderNo !== 'ALL') query.subOrderNo = c.text(params.orderNo, '订单号', 1, 50);

      const total = (await db.collection('merchant_orders').where(query).count()).total;
      const docs = (await db.collection('merchant_orders').where(query).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()).data;
      const list = docs.map(o => ({ ...o, id: o._id || o.id, orderNo: o.subOrderNo || o.orderNo, payAmount: o.totalAmount || o.payAmount || 0 }));

      return success({ list, total, page, pageSize, hasMore: page * pageSize < total });
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

    // 平台执行退款 (真实微信部分退款 + 回退库存销量)
    if (action === 'executeRefund') {
      requirePermission(admin, 'order.ship');
      if (admin.merchantId) throw c.error('PERMISSION_DENIED', '仅平台可执行退款');
      const subOrderId = c.text(params.orderId, '子订单ID');
      const sub = await c.get(db, 'merchant_orders', subOrderId);
      if (!sub) throw c.error('ORDER_NOT_FOUND', '子订单不存在');
      if (sub.status !== 'REFUNDING') throw c.error('INVALID_ORDER_STATUS', '子订单不在待执行退款状态');

      // TODO: 调用微信支付 API v3 部分退款 /v3/refund/domestic/refunds
      // out_trade_no = 支付单 orderNo, out_refund_no = refund_records.outRefundNo, amount.refund = 子订单 refundFee

      const now = new Date();
      await c.transaction(db, async tx => {
        for (const item of (sub.items || [])) {
          const sku = await c.get(tx, 'product_skus', item.skuId);
          if (sku) await tx.collection('product_skus').doc(item.skuId).update({ data: { stock: (sku.stock || 0) + item.count, updatedAt: now } });
          const p = await c.get(tx, 'products', item.productId);
          if (p) await tx.collection('products').doc(item.productId).update({ data: { sales: Math.max(0, (p.sales || 0) - item.count), totalStock: (p.totalStock || 0) + item.count, updatedAt: now } });
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
