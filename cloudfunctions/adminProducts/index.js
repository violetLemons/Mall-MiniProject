const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');
const commerce = require('./common/commerce');
const content = require('./common/contentSafety');

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

const { requireAdmin, requirePermission } = require('./common/authMiddleware');
function getEnvId() {
  try { return cloud.getWXContext().ENV || process.env.TCB_ENV || ''; }
  catch { return process.env.TCB_ENV || ''; }
}

// 云存储临时链接 → 永久 fileID（cloud://）。仅转换 tcb.qcloud.la 的临时链接；fileID/dataURL/外部图原样保留。
function toFileID(value) {
  if (typeof value !== 'string' || !value) return value;
  if (value.startsWith('cloud://')) return value.replace(/\.tcb\.qcloud\.la(?=\/)/, '');
  if (value.startsWith('data:image/')) return value;
  if (!/\.tcb\.qcloud\.la\//.test(value)) return value;
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/\.tcb\.qcloud\.la$/, '');
    const path = u.pathname.replace(/^\/+/, '');
    const env = getEnvId();
    if (!host || !path || !env) return value;
    return `cloud://${env}.${host}/${path}`;
  } catch { return value; }
}

// 把文档指定图片字段里的 cloud:// fileID 批量换成临时链接（仅浏览器端展示需要，实时生成）
async function fileIDsToTempURLs(docs, keys) {
  const ids = new Set();
  for (const doc of docs) {
    for (const k of keys) {
      const v = doc[k];
      if (typeof v === 'string' && v.startsWith('cloud://')) ids.add(v);
      else if (Array.isArray(v)) v.forEach(x => { if (typeof x === 'string' && x.startsWith('cloud://')) ids.add(x); });
    }
  }
  if (ids.size === 0) return;
  try {
    const res = await cloud.getTempFileURL({ fileList: Array.from(ids) });
    const map = {};
    (res.fileList || []).forEach(f => { if (f.status === 0 && f.tempFileURL) map[f.fileID] = f.tempFileURL; });
    for (const doc of docs) {
      for (const k of keys) {
        const v = doc[k];
        if (typeof v === 'string') { if (map[v]) doc[k] = map[v]; }
        else if (Array.isArray(v)) doc[k] = v.map(x => map[x] || x);
      }
    }
  } catch (_) { /* 转换失败则原样返回 fileID，不抛错 */ }
}

function fields(p) {
  const out = {};
  for (const k of ['name', 'subtitle', 'description', 'categoryId', 'cover', 'brand']) {
    if (p[k] !== undefined && p[k] !== null) {
      const val = String(p[k]);
      out[k] = text(val, k, ['subtitle', 'description'].includes(k) ? 0 : 1, k === 'description' ? 5000 : 500);
    }
  }
  for (const k of ['images', 'detailImages', 'tags', ]) {
    if (p[k] !== undefined && p[k] !== null) {
      const arr = Array.isArray(p[k]) ? p[k] : typeof p[k] === 'string' ? p[k].split(',').map(s => s.trim()).filter(Boolean) : [];
      if (arr.length > 30 || arr.some(x => typeof x !== 'string' || x.length > 2000)) throw error('INVALID_PARAMS', '图片或标签格式不正确');
      out[k] = arr;
    }
  }
  for (const url of [out.cover, ...(out.images || []), ...(out.detailImages || [])].filter(Boolean)) {
    if (!/^(https:\/\/|cloud:\/\/)/.test(url)) throw error('INVALID_PARAMS', '图片须使用HTTPS或云存储地址');
  }
  for (const k of ['sort', 'originalPrice', 'minPrice', 'maxPrice', 'sales']) {
    if (p[k] !== undefined && p[k] !== null && p[k] !== '') {
      out[k] = integer(p[k], k);
    }
  }
  for (const k of ['isHot', 'isNew']) {
    if (p[k] !== undefined && p[k] !== null) {
      out[k] = Boolean(p[k]);
    }
  }
  if (out.cover) out.cover = toFileID(out.cover);
  for (const k of ['images', 'detailImages']) {
    if (Array.isArray(out[k])) out[k] = out[k].map(toFileID);
  }
  return out;
}

// 无规格时用商品的基准价自动生成单一隐藏默认 SKU（颜色=默认、规格=1）
function buildDefaultSkuInput(product) {
  const price = integer(product.minPrice, '商品价格分', 1);
  return { colorName: '默认', size: 1, price };
}

async function saveSkus(tx, product, inputs, old, admin) {
  if (!Array.isArray(inputs) || inputs.length === 0) inputs = [buildDefaultSkuInput(product)];
  if (inputs.length !== 1 || inputs[0].status === 'DISABLED') throw error('INVALID_PARAMS', '每个商品必须只有一个有效SKU');
  const pairs = new Set(), ids = new Set(), all = [];
  for (const s of inputs) {
    const colorName = text(s.colorName, '颜色', 1, 40), size = integer(s.size, '规格', 1, 100000);
    const pair = `${colorName}:${size}`;
    if (pairs.has(pair)) throw error('DUPLICATE_SKU', '颜色规格重复'); pairs.add(pair);
    const id = s.id || s.skuId || old.find(x => x.colorName === colorName && x.size === size)?._id || key(product._id, colorName, size);
    if (ids.has(id)) throw error('DUPLICATE_SKU', '规格ID重复'); ids.add(id);
    const previous = await getDoc(tx, 'product_skus', id);
    if (previous && previous.productId !== product._id) throw error('PERMISSION_DENIED', '规格不属于此商品');
    const price = integer(s.price, '价格分', 1);
    if (s.status && !['ACTIVE', 'DISABLED'].includes(s.status)) throw error('INVALID_PARAMS', '规格状态无效');
    const row = {
      productId: product._id, skuCode: id, colorId: s.colorId || key(colorName), colorName, size, price,
      colorImage: s.colorImage || product.cover, status: s.status || 'ACTIVE',
      createdAt: previous?.createdAt || new Date(), updatedAt: new Date()
    };
    if (!/^(https:\/\/|cloud:\/\/)/.test(row.colorImage)) throw error('INVALID_PARAMS', '规格图片须使用HTTPS或云存储地址');
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
    skuCount: inputs.length,
    skuVersion: (product.skuVersion || 0) + 1,
    updatedAt: new Date()
  };
  await tx.collection('products').doc(product._id).update({ data: aggregate });
  return aggregate;
}

exports.main = async event => {
  try {
    const admin = await requireAdmin(event, db), { action, params = {} } = event;
    if (action === 'getStoreSettings') { requirePermission(admin,'product.view'); return success(await require('./common/storeSettings').read(db)); }
    if (action === 'saveStoreSettings') {
      requirePermission(admin,'product.update');
      const settings=require('./common/storeSettings'), data=settings.validate(params);
      await content.checkText(cloud,process.env.CONTENT_SECURITY_OPENID,[data.mallName,data.companyName,data.serviceHours,data.privacyContact].join('\n'),3);
      await commerce.transaction(db,async tx=>{
        const old=await settings.read(tx);
        if((params.expectedRevision || '')!==old.revision)throw error('CONFLICT','配置已被其他管理员修改，请刷新');
        await tx.collection('store_settings').doc(settings.ID).set({data});
        await tx.collection('operation_logs').add({data:{adminId:admin.adminId,action:'SAVE_STORE_SETTINGS',resourceType:'STORE',resourceId:settings.ID,revision:data.revision,createdAt:new Date()}});
      });
      return success(data);
    }
    if(params.skus!==undefined && !Array.isArray(params.skus))throw error('INVALID_PARAMS','SKU须为数组');
    const supportedActions = new Set(['list', 'get', 'create', 'update', 'updateSkus', 'updateStatus', 'delete', 'softDelete', 'restore', 'uploadImage']);
    if (!supportedActions.has(action)) throw error('ACTION_NOT_FOUND', `未知指令: ${action}`);

    // 上传图片（封面/详情大图）
    if (action === 'uploadImage') {
      const isSuper = admin.role === 'SUPER_ADMIN' || admin.permissions?.includes('*');
      if (!isSuper && !admin.permissions?.includes('product.create') && !admin.permissions?.includes('product.update')) {
        throw error('PERMISSION_DENIED', '无权上传商品图片');
      }
      const base64Data = params.base64 || '';
      const filename = params.filename || 'cover.jpg';
      if (typeof base64Data !== 'string' || !base64Data || base64Data.length > 2 * 1024 * 1024) throw error('INVALID_PARAMS', '图片数据无效或过大');
      const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const rawExt = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ext = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg';
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
        throw error('UPLOAD_FAILED', '云存储上传失败，请重试');
      }
    }

    // 商品列表
    if (action === 'list') {
      requirePermission(admin, 'product.view');
      const page = integer(params.page || 1, '页码', 1, 10000);
      const pageSize = integer(params.pageSize || 20, '每页数量', 1, 100);
      const query = { status: params.status || db.command.neq('DELETED') };
      if (params.categoryId) query.categoryId = text(params.categoryId, '分类');
      if (params.keyword) query.name = db.RegExp({ regexp: text(params.keyword, '关键词', 1, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
      const [listRes, countRes] = await Promise.all([
        db.collection('products').where(query).orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get(),
        db.collection('products').where(query).count()
      ]);
      await fileIDsToTempURLs(listRes.data, ['cover', 'images', 'detailImages']);
      return success({ list: listRes.data, total: countRes.total, page, pageSize });
    }

    const id = action === 'create' ? key(crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) : text(params.id, '商品ID');

    // 商品详情与SKU列表
    if (action === 'get') {
      requirePermission(admin, 'product.view');
      const [prod, skusRes] = await Promise.all([
        getDoc(db, 'products', id),
        db.collection('product_skus').where({ productId: id }).limit(100).get()
      ]);
      if (prod) {
        prod.coverFileID = prod.cover;
        prod.imagesFileIDs = prod.images;
        prod.detailImagesFileIDs = prod.detailImages;
        await fileIDsToTempURLs([prod], ['cover', 'images', 'detailImages']);
      }
      return success({ product: prod, skus: skusRes.data });
    }

    requirePermission(admin, action === 'create' ? 'product.create' : ['delete', 'softDelete', 'purge'].includes(action) ? 'product.delete' : action === 'updateStatus' ? 'product.status' : 'product.update');
    if (action === 'purge') throw error('OPERATION_FORBIDDEN', '请使用软删除保留业务引用');


    const oldSkus = action === 'updateSkus' ? (await db.collection('product_skus').where({ productId: id }).limit(100).get()).data : [];
    const before = action === 'updateSkus' ? await getDoc(db, 'products', id) : null;

    const safetyVersion = crypto.randomUUID();
    if (['create','update','updateSkus'].includes(action)) {
      const existing = action === 'create' ? null : await getDoc(db,'products',id);
      await content.checkText(cloud, process.env.CONTENT_SECURITY_OPENID, [params.name ?? existing?.name, params.brand ?? existing?.brand, params.subtitle ?? existing?.subtitle, params.description ?? existing?.description, ...(params.tags || existing?.tags || []), ...(params.skus || []).map(s=>s.colorName)].filter(Boolean).join('\n'), 3);
    }
    const txResult = await commerce.transaction(db, async tx => {
      let p = await getDoc(tx, 'products', id), result = null;
      if (action !== 'create' && !p) throw error('PRODUCT_NOT_FOUND', '商品不存在');
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
            status: 'OFF_SALE',
            contentSafety: { version: safetyVersion, status: 'PENDING' },
            deletedAt: null,
            sales: 0,
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
          const updateData = { ...data, status: 'OFF_SALE', contentSafety: { version: safetyVersion, status: 'PENDING' }, updatedAt: new Date() };
          delete updateData._id;
          delete updateData.id;
          await tx.collection('products').doc(id).update({ data: updateData });
          const merged = { ...p, ...updateData };
          const oldSkus = (await tx.collection('product_skus').where({ productId: id }).limit(100).get()).data;
          const activeSkus = oldSkus.filter(s=>s.status === 'ACTIVE');
          const inputs = params.skus === undefined && activeSkus.length ? activeSkus.map(s => ({ ...s, id: s._id, price: data.minPrice ?? s.price })) : params.skus;
          await saveSkus(tx, merged, inputs, oldSkus, admin);
        }
      } else if (action === 'updateSkus') {
        if ((p.skuVersion || 0) !== (before?.skuVersion || 0)) throw error('CONFLICT', '规格已被其他管理员更新，请刷新');
        result = await saveSkus(tx, p, params.skus, oldSkus, admin);
        await tx.collection('products').doc(id).update({ data: { status: 'OFF_SALE', contentSafety: { version: safetyVersion, status: 'PENDING' } } });
      } else {
        const status = ['delete', 'softDelete'].includes(action) ? 'DELETED' : action === 'restore' ? 'OFF_SALE' : params.status;
        if (!['DELETED', 'OFF_SALE', 'ON_SALE'].includes(status)) throw error('INVALID_PARAMS', '状态无效');
        if (status === 'ON_SALE' && p.contentSafety?.status !== 'PASS') throw error('CONTENT_REVIEW_REQUIRED', '微信内容审核通过后才能上架');
        if (status === 'ON_SALE' && (!p.minPrice || !p.skuVersion)) throw error('INVALID_PARAMS', '请先配置有效的规格和价格');
        if (status === 'ON_SALE') {
          const active = (await tx.collection('product_skus').where({productId:id,status:'ACTIVE'}).limit(2).get()).data;
          if (active.length !== 1 || active[0].price !== p.minPrice || p.minPrice !== p.maxPrice) throw error('INVALID_PARAMS','商品须为单SKU且价格一致');
        }
        await tx.collection('products').doc(id).update({ data: { status, deletedAt: status === 'DELETED' ? new Date() : null, updatedAt: new Date() } });
      }
      if (['create','update','updateSkus'].includes(action)) {
        const product = await getDoc(tx,'products',id);
        const skus = (await tx.collection('product_skus').where({productId:id,status:'ACTIVE'}).get()).data;
        await content.reviewAssets(cloud,db,'PRODUCT',id,safetyVersion,[product.cover,...(product.images||[]),...(product.detailImages||[]),...skus.map(s=>s.colorImage)],process.env.CONTENT_SECURITY_OPENID,tx);
      }
      await tx.collection('operation_logs').doc(key(crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))).set({ data: {
        adminId: admin.adminId, adminUsername: admin.username, action,
        resourceType: 'PRODUCT', resourceId: id, createdAt: new Date()
      } });
      return result;
    });

    return success(txResult);
  } catch (e) {
    console.error('[adminProducts] Error:', e.code || 'ERROR', e.message || e);
    return fail(e.code, e.message);
  }
};
