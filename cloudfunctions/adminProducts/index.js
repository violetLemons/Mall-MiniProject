const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

// --- Helper Functions (Self-contained, bulletproof) ---
const error = (code, message) => Object.assign(new Error(message), { code });
const key = (...parts) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);

function text(value, name, min = 1, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw error('INVALID_PARAMS', `${name}格式不正确 (需 ${min}~${max} 个字符)`);
  }
  return value.trim();
}

function integer(value, name, min = 0, max = 100000000) {
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < min || num > max) {
    throw error('INVALID_PARAMS', `${name}必须为 ${min}~${max} 的整数`);
  }
  return num;
}

async function getDoc(dbOrTx, collection, id) {
  try {
    const res = await dbOrTx.collection(collection).doc(id).get();
    return Array.isArray(res.data) ? res.data[0] || null : res.data || null;
  } catch (e) {
    const message = String(e?.message || e?.errMsg || '');
    if (/not.?exist|not found|不存在/i.test(message) || ['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(e?.code)) return null;
    throw e;
  }
}

function success(data = null, message = '操作成功') {
  return {
    success: true,
    code: 'OK',
    message,
    data,
    requestId: crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random()),
    serverTime: Date.now()
  };
}

function fail(code = 'SYSTEM_ERROR', message = '服务暂时不可用，请稍后重试') {
  return {
    success: false,
    code: (typeof code === 'string' && /^[A-Z_]{3,50}$/.test(code)) ? code : 'SYSTEM_ERROR',
    message: String(message || '服务异常'),
    data: null,
    requestId: crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random()),
    serverTime: Date.now()
  };
}

function getJwtSecret(event) {
  return event?.adminJwtSecret || process.env.ADMIN_JWT_SECRET || '636353631d78ee1619556dc0a92cd2f4111317b5820e821a6d307de9947b6bbf';
}

function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  try {
    const [h, b, s, extra] = token.split('.');
    if (!h || !b || !s || extra) return null;
    const header = JSON.parse(Buffer.from(h, 'base64url'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
    const p = JSON.parse(Buffer.from(b, 'base64url'));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(p.exp) || !Number.isSafeInteger(p.iat) || p.exp <= now || p.iat > now + 60 || p.exp - p.iat > 48 * 3600 || p.iss !== 'sneaker-admin' || p.aud !== 'sneaker-admin-api') return null;
    return p;
  } catch {
    return null;
  }
}

function permissionVersion(admin) {
  return crypto.createHash('sha256').update(JSON.stringify([admin.role, (admin.permissions || []).slice().sort(), admin.sessionVersion || 0])).digest('hex');
}

async function requireAdmin(event, db) {
  const secret = getJwtSecret(event);
  const headers = event.headers || event.header || {};
  const token = (event.token || headers.authorization || headers.Authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token, secret);
  if (!payload || !payload.adminId) throw error('AUTH_REQUIRED', '登录已失效，请重新登录');
  const admin = await getDoc(db, 'admins', payload.adminId);
  if (!admin || admin.status !== 'ACTIVE') throw error('ADMIN_REQUIRED', '管理员账号不存在或已停用');
  if (payload.version !== permissionVersion(admin)) throw error('AUTH_REQUIRED', '权限或会话已变更，请重新登录');
  return { adminId: admin._id, username: admin.username, role: admin.role, permissions: admin.permissions || [], merchantId: admin.merchantId || null };
}

function requirePermission(admin, permission) {
  if (admin.role === 'SUPER_ADMIN' || admin.permissions?.includes('*') || admin.permissions?.includes(permission)) return true;
  throw error('PERMISSION_DENIED', `无权执行此操作 (需要权限: ${permission})`);
}

function fields(p) {
  const out = {};
  for (const k of ['name', 'subtitle', 'description', 'categoryId', 'cover', 'brand']) {
    if (p[k] !== undefined && p[k] !== null) {
      const val = String(p[k]);
      out[k] = text(val, k, ['subtitle', 'description'].includes(k) ? 0 : 1, k === 'description' ? 5000 : 500);
    }
  }
  for (const k of ['images', 'detailImages', 'tags', 'deliveryTypes']) {
    if (p[k] !== undefined && p[k] !== null) {
      const arr = Array.isArray(p[k]) ? p[k] : typeof p[k] === 'string' ? p[k].split(',').map(s => s.trim()).filter(Boolean) : [];
      if (arr.length > 30 || arr.some(x => typeof x !== 'string' || x.length > 2000)) throw error('INVALID_PARAMS', '图片或标签格式不正确');
      out[k] = arr;
    }
  }
  for (const url of [out.cover, ...(out.images || []), ...(out.detailImages || [])].filter(Boolean)) {
    if (!/^(https:\/\/|cloud:\/\/|data:image\/|\/\/)/.test(url)) throw error('INVALID_PARAMS', '图片须使用HTTPS、云存储地址或DataURL');
  }
  for (const k of ['sort', 'originalPrice', 'minPrice', 'maxPrice', 'totalStock']) {
    if (p[k] !== undefined && p[k] !== null && p[k] !== '') {
      out[k] = integer(p[k], k);
    }
  }
  for (const k of ['isHot', 'isNew']) {
    if (p[k] !== undefined && p[k] !== null) {
      out[k] = Boolean(p[k]);
    }
  }
  return out;
}

// 无规格时用商品的基准价/总库存自动生成单一隐藏默认 SKU（颜色=默认、规格=1）
function buildDefaultSkuInput(product) {
  const price = Number(product.minPrice) > 0 ? Number(product.minPrice) : 1;
  const stock = Number(product.totalStock) >= 0 ? Number(product.totalStock) : 0;
  return { colorName: '默认', size: 1, price, stock };
}

async function saveSkus(tx, product, inputs, old, admin) {
  if (!Array.isArray(inputs) || inputs.length === 0) inputs = [buildDefaultSkuInput(product)];
  if (inputs.length > 30 || old.length > 30) throw error('INVALID_PARAMS', '规格矩阵须为1~30项');
  const pairs = new Set(), ids = new Set(), all = [];
  for (const s of inputs) {
    const colorName = text(s.colorName, '颜色', 1, 40), size = integer(s.size, '规格', 1, 100000);
    const pair = `${colorName}:${size}`;
    if (pairs.has(pair)) throw error('DUPLICATE_SKU', '颜色规格重复'); pairs.add(pair);
    const id = s.id || s.skuId || old.find(x => x.colorName === colorName && x.size === size)?._id || key(product._id, colorName, size);
    if (ids.has(id)) throw error('DUPLICATE_SKU', '规格ID重复'); ids.add(id);
    const previous = await getDoc(tx, 'product_skus', id);
    if (previous && previous.productId !== product._id) throw error('PERMISSION_DENIED', '规格不属于此商品');
    const stock = integer(s.stock, '库存'), lockedStock = previous?.lockedStock || 0, price = integer(s.price, '价格分', 1);
    if (stock < lockedStock) throw error('LOCKED_STOCK', '库存不得低于已锁数量');
    if (s.status && !['ACTIVE', 'DISABLED'].includes(s.status)) throw error('INVALID_PARAMS', '规格状态无效');
    const row = {
      productId: product._id, skuCode: id, colorId: s.colorId || key(colorName), colorName, size, price,
      colorImage: s.colorImage || product.cover, stock, lockedStock, status: s.status || 'ACTIVE',
      createdAt: previous?.createdAt || new Date(), updatedAt: new Date()
    };
    if (!/^(https:\/\/|cloud:\/\/|data:image\/)/.test(row.colorImage)) throw error('INVALID_PARAMS', '规格图片地址不安全');
    await tx.collection('product_skus').doc(id).set({ data: row });
    all.push(row);
  }
  for (const s of old) if (!ids.has(s._id)) {
    const fresh = await getDoc(tx, 'product_skus', s._id);
    await tx.collection('product_skus').doc(s._id).update({ data: { status: 'DISABLED' } });
    all.push({ ...fresh, status: 'DISABLED' });
  }
  const active = all.filter(s => s.status === 'ACTIVE');
  const aggregate = {
    minPrice: active.length ? Math.min(...active.map(s => s.price)) : 0,
    maxPrice: active.length ? Math.max(...active.map(s => s.price)) : 0,
    totalStock: all.reduce((sum, s) => sum + s.stock, 0),
    skuCount: inputs.length,
    skuVersion: (product.skuVersion || 0) + 1,
    updatedAt: new Date()
  };
  await tx.collection('products').doc(product._id).update({ data: aggregate });
  return aggregate;
}

// 商家新增/修改商品 → 提交审核工单（不直接写 products）
async function submitTicket(db, admin, action, params, id) {
  const data = fields(params);
  if (action === 'create' && (!data.name || !data.cover)) throw error('INVALID_PARAMS', '请填写商品名称和封面');
  if (action === 'update' || action === 'updateSkus') {
    const existing = await getDoc(db, 'products', id);
    if (!existing) throw error('PRODUCT_NOT_FOUND', '商品不存在');
    if ((existing.merchantId || null) !== admin.merchantId) throw error('PERMISSION_DENIED', '无权修改其他商家的商品');
  }
  if (Array.isArray(params.skus) && (params.skus.length < 1 || params.skus.length > 30)) throw error('INVALID_PARAMS', '规格矩阵须为1~30项');

  // 合并：同一商品同一时刻至多一个 PENDING UPDATE 工单，避免乱序通过时旧数据覆盖
  if (action === 'update' || action === 'updateSkus') {
    const pending = (await db.collection('product_audit_tickets')
      .where({ merchantId: admin.merchantId, productId: id, status: 'PENDING' })
      .limit(1)
      .get()).data[0];
    if (pending) {
      const oldPayload = pending.payload || {};
      const mergedPayload = {
        product: action === 'update' ? { ...(oldPayload.product || {}), ...data } : (oldPayload.product || {}),
        skus: Array.isArray(params.skus) ? params.skus : (oldPayload.skus || null)
      };
      await db.collection('product_audit_tickets').doc(pending._id).update({
        data: { payload: mergedPayload, updatedAt: new Date() }
      });
      return { ticketId: pending._id, status: 'PENDING' };
    }
  }

  const ticketId = key(crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const ticket = {
    merchantId: admin.merchantId,
    type: action === 'create' ? 'CREATE' : 'UPDATE',
    productId: action === 'create' ? null : id,
    payload: { product: data, skus: Array.isArray(params.skus) ? params.skus : null },
    status: 'PENDING',
    platformFee: 0,
    rejectReason: '',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection('product_audit_tickets').doc(ticketId).set({ data: ticket });
  return { ticketId, status: 'PENDING' };
}

exports.main = async event => {
  try {
    const admin = await requireAdmin(event, db), { action, params = {} } = event;
    const supportedActions = new Set(['list', 'get', 'create', 'update', 'updateSkus', 'updateStatus', 'delete', 'softDelete', 'restore', 'uploadImage', 'listTickets', 'reviewTicket', 'reseedDefaultSkus']);
    if (!supportedActions.has(action)) throw error('ACTION_NOT_FOUND', `未知指令: ${action}`);

    // 上传图片（封面/详情大图）
    if (action === 'uploadImage') {
      const isSuper = admin.role === 'SUPER_ADMIN' || admin.permissions?.includes('*');
      if (!isSuper && !admin.permissions?.includes('product.create') && !admin.permissions?.includes('product.update')) {
        throw error('PERMISSION_DENIED', '无权上传商品图片');
      }
      const base64Data = params.base64 || '';
      const filename = params.filename || 'cover.jpg';
      if (!base64Data) throw error('INVALID_PARAMS', '请提供图片数据');
      const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const ext = filename.split('.').pop() || 'jpg';
      const cloudPath = `products/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      try {
        const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer });
        let url = uploadRes.fileID;
        try {
          const tempRes = await cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
          if (tempRes.fileList?.[0]?.tempFileURL) url = tempRes.fileList[0].tempFileURL;
        } catch (_) {}
        return success({ fileID: uploadRes.fileID, url });
      } catch (uploadErr) {
        console.warn('[uploadImage] cloud.uploadFile fallback to DataURL:', uploadErr.message);
        return success({ fileID: null, url: base64Data });
      }
    }

    // 商品列表
    if (action === 'list') {
      requirePermission(admin, 'product.view');
      const page = integer(params.page || 1, '页码', 1, 10000);
      const pageSize = integer(params.pageSize || 20, '每页数量', 1, 100);
      const query = { status: params.status || db.command.neq('DELETED') };
      if (admin.merchantId) query.merchantId = admin.merchantId;
      if (params.categoryId) query.categoryId = text(params.categoryId, '分类');
      if (params.keyword) query.name = db.RegExp({ regexp: text(params.keyword, '关键词', 1, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
      const [listRes, countRes] = await Promise.all([
        db.collection('products').where(query).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get(),
        db.collection('products').where(query).count()
      ]);
      return success({ list: listRes.data, total: countRes.total, page, pageSize });
    }

    // 商品审核工单列表（商家看自己的，平台看全部）
    if (action === 'listTickets') {
      requirePermission(admin, 'product.view');
      const page = integer(params.page || 1, '页码', 1, 10000);
      const pageSize = integer(params.pageSize || 20, '每页数量', 1, 100);
      const query = {};
      if (admin.merchantId) query.merchantId = admin.merchantId;
      if (params.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(params.status)) query.status = params.status;
      const [listRes, countRes] = await Promise.all([
        db.collection('product_audit_tickets').where(query).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get(),
        db.collection('product_audit_tickets').where(query).count()
      ]);
      return success({ list: listRes.data, total: countRes.total, page, pageSize });
    }

    // 平台审核商品工单（通过并填抽成 / 驳回）
    if (action === 'reviewTicket') {
      if (admin.role !== 'SUPER_ADMIN') throw error('PERMISSION_DENIED', '仅平台超级管理员可审核商品');
      const ticketId = text(params.ticketId, '工单ID');
      const decision = text(params.decision, '审核结果');
      if (!['approve', 'reject'].includes(decision)) throw error('INVALID_PARAMS', '审核结果无效');
      const platformFee = decision === 'approve' ? integer(params.platformFee || 0, '平台抽成', 0, 100000000) : 0;
      const rejectReason = decision === 'reject' ? text(params.rejectReason || '', '驳回原因', 1, 500) : '';
      const txResult = await db.runTransaction(async tx => {
        const ticket = await getDoc(tx, 'product_audit_tickets', ticketId);
        if (!ticket) throw error('TICKET_NOT_FOUND', '工单不存在');
        if (ticket.status !== 'PENDING') throw error('TICKET_ALREADY_REVIEWED', '工单已处理，请勿重复审核');
        const now = new Date();
        if (decision === 'reject') {
          await tx.collection('product_audit_tickets').doc(ticketId).update({ data: { status: 'REJECTED', rejectReason, reviewedBy: admin.adminId, reviewedAt: now, updatedAt: now } });
          return { ticketId, status: 'REJECTED' };
        }
        const payload = ticket.payload || {};
        const prodData = payload.product || {};
        if (prodData.categoryId) {
          const category = await getDoc(tx, 'categories', prodData.categoryId);
          if (!category || category.status !== 'ACTIVE') throw error('INVALID_CATEGORY', '请选择有效分类');
        }
        // 商家若已被下架/删除，新商品审核通过后保持下架，避免绕过商家管控
        let merchantActive = true;
        if (ticket.merchantId) {
          const mRes = await tx.collection('admins').where({ merchantId: ticket.merchantId, role: 'MERCHANT' }).limit(1).get();
          const m = mRes.data && mRes.data[0];
          merchantActive = !m || m.status === 'ACTIVE';
        }
        if (ticket.type === 'CREATE') {
          if (!prodData.name || !prodData.cover) throw error('INVALID_PARAMS', '工单缺少商品名称或封面');
          const newId = key(crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
          const docData = {
            ...prodData,
            merchantId: ticket.merchantId || null,
            platformFee,
            status: merchantActive ? 'ON_SALE' : 'OFF_SALE',
            deletedAt: null,
            sales: 0,
            totalStock: prodData.totalStock || 0,
            minPrice: prodData.minPrice || 0,
            maxPrice: prodData.maxPrice || prodData.minPrice || 0,
            sort: prodData.sort || 0,
            createdAt: now,
            updatedAt: now
          };
          delete docData._id; delete docData.id;
          await tx.collection('products').doc(newId).set({ data: docData });
          const p = { ...docData, _id: newId };
          await saveSkus(tx, p, payload.skus, [], admin);
        } else {
          const existing = await getDoc(tx, 'products', ticket.productId);
          if (!existing) throw error('PRODUCT_NOT_FOUND', '商品不存在或已被删除');
          const updateData = { ...prodData, platformFee, updatedAt: now };
          delete updateData._id; delete updateData.id;
          await tx.collection('products').doc(existing._id).update({ data: updateData });
          const merged = { ...existing, ...updateData };
          const oldSkus = (await tx.collection('product_skus').where({ productId: existing._id }).limit(100).get()).data;
          await saveSkus(tx, merged, payload.skus, oldSkus, admin);
        }
        await tx.collection('product_audit_tickets').doc(ticketId).update({ data: { status: 'APPROVED', platformFee, reviewedBy: admin.adminId, reviewedAt: now, updatedAt: now } });
        return { ticketId, status: 'APPROVED' };
      });
      return success(txResult);
    }

    // 重置所有商品的 SKU：删除现有全部 SKU，并按每个商品的基准价/总库存重建单一隐藏默认 SKU
    if (action === 'reseedDefaultSkus') {
      if (admin.role !== 'SUPER_ADMIN') throw error('PERMISSION_DENIED', '仅平台超级管理员可重置 SKU');
      let total = 0, created = 0, skip = 0;
      for (;;) {
        const batch = await db.collection('products').skip(skip).limit(100).get();
        const list = batch.data || [];
        if (list.length === 0) break;
        for (const p of list) {
          total++;
          const oldSkus = (await db.collection('product_skus').where({ productId: p._id }).limit(100).get()).data;
          for (const s of oldSkus) await db.collection('product_skus').doc(s._id).remove().catch(() => {});
          await saveSkus(db, p, [], [], admin);
          created++;
        }
        skip += list.length;
      }
      return success({ total, created });
    }

    const id = action === 'create' ? key(crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) : text(params.id, '商品ID');

    // 商品详情与SKU列表
    if (action === 'get') {
      requirePermission(admin, 'product.view');
      const [prod, skusRes] = await Promise.all([
        getDoc(db, 'products', id),
        db.collection('product_skus').where({ productId: id }).limit(100).get()
      ]);
      if (admin.merchantId && prod && (prod.merchantId || null) !== admin.merchantId) throw error('PERMISSION_DENIED', '无权查看其他商家的商品');
      return success({ product: prod, skus: skusRes.data });
    }

    requirePermission(admin, action === 'create' ? 'product.create' : ['delete', 'softDelete', 'purge'].includes(action) ? 'product.delete' : action === 'updateStatus' ? 'product.status' : 'product.update');
    if (action === 'purge') throw error('OPERATION_FORBIDDEN', '请使用软删除保留业务引用');

    // 商家（merchantId 非空）新增/修改商品 → 提交审核工单，不直接写商品
    if (admin.merchantId && ['create', 'update', 'updateSkus'].includes(action)) {
      return success(await submitTicket(db, admin, action, params, id));
    }

    const oldSkus = action === 'updateSkus' ? (await db.collection('product_skus').where({ productId: id }).limit(100).get()).data : [];
    const before = action === 'updateSkus' ? await getDoc(db, 'products', id) : null;

    const txResult = await db.runTransaction(async tx => {
      let p = await getDoc(tx, 'products', id), result = null;
      if (action !== 'create' && !p) throw error('PRODUCT_NOT_FOUND', '商品不存在');
      if (action !== 'create' && admin.merchantId && (p.merchantId || null) !== admin.merchantId) throw error('PERMISSION_DENIED', '无权操作其他商家的商品');
      if (['create', 'update'].includes(action)) {
        const data = fields(params), categoryId = data.categoryId || p?.categoryId;
        if (categoryId) {
          const category = await getDoc(tx, 'categories', categoryId);
          if (!category || category.status !== 'ACTIVE') throw error('INVALID_CATEGORY', '请选择有效分类');
        }
        if (action === 'create') {
          if (!data.name || !data.cover) throw error('INVALID_PARAMS', '请填写商品名称和封面');
          const docData = {
            ...data,
            merchantId: admin.merchantId || null,
            status: 'OFF_SALE',
            deletedAt: null,
            sales: 0,
            totalStock: data.totalStock || 0,
            minPrice: data.minPrice || 0,
            maxPrice: data.maxPrice || data.minPrice || 0,
            sort: data.sort || 0,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          delete docData._id;
          delete docData.id;
          await tx.collection('products').doc(id).set({ data: docData });
          p = { ...docData, _id: id };
          await saveSkus(tx, p, params.skus, [], admin);
          result = { productId: id };
        } else {
          const updateData = { ...data, updatedAt: new Date() };
          delete updateData._id;
          delete updateData.id;
          await tx.collection('products').doc(id).update({ data: updateData });
          const merged = { ...p, ...updateData };
          const oldSkus = (await tx.collection('product_skus').where({ productId: id }).limit(100).get()).data;
          await saveSkus(tx, merged, params.skus, oldSkus, admin);
        }
      } else if (action === 'updateSkus') {
        if ((p.skuVersion || 0) !== (before?.skuVersion || 0)) throw error('CONFLICT', '规格已被其他管理员更新，请刷新');
        result = await saveSkus(tx, p, params.skus, oldSkus, admin);
      } else {
        const status = ['delete', 'softDelete'].includes(action) ? 'DELETED' : action === 'restore' ? 'OFF_SALE' : params.status;
        if (!['DELETED', 'OFF_SALE', 'ON_SALE'].includes(status)) throw error('INVALID_PARAMS', '状态无效');
        if (status === 'ON_SALE' && (!p.minPrice || !p.skuVersion)) throw error('INVALID_PARAMS', '请先配置有效的规格和价格');
        await tx.collection('products').doc(id).update({ data: { status, deletedAt: status === 'DELETED' ? new Date() : null, updatedAt: new Date() } });
      }
      return result;
    });

    try {
      await db.collection('operation_logs').doc(key(crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))).set({ data: {
        adminId: admin.adminId, adminUsername: admin.username, action,
        resourceType: 'PRODUCT', resourceId: id, createdAt: new Date()
      } });
    } catch (_) {}

    return success(txResult);
  } catch (e) {
    console.error('[adminProducts] Error:', e.code || 'ERROR', e.message || e);
    return fail(e.code, e.message);
  }
};
