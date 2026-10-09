const c = require('./commerce'), safety = require('./contentSafety'), crypto = require('crypto');
// Public catalogue edits reuse the same versioned queue as products and profiles.
async function saveCatalog(cloud, db, admin, type, action, params) {
  const collection = type === 'CATEGORY' ? 'categories' : 'banners';
  let id = params.id;
  if (action === 'updatePromoCard') {
    const key = c.text(params.key || params.id, '卡片标识', 1, 64);
    const existing = (await db.collection('banners').where({ type: 'PROMO_ZONE', key }).limit(1).get()).data[0];
    id = existing?._id || c.key('PROMO_ZONE', key);
    params = { ...params, key, type: 'PROMO_ZONE' };
  } else if (action === 'create') id = c.key(crypto.randomUUID());
  id = c.text(id, '内容ID', 1, 100);
  const old = await c.get(db, collection, id);
  if (action === 'update' && !old) throw c.error('NOT_FOUND', '内容不存在');
  const keys = type === 'CATEGORY' ? ['name','icon','badge','parentId','sort','status'] : ['title','subtitle','imageUrl','linkType','targetUrl','badge','sort','status','desc','tag','key','type'];
  const row = { ...old };
  for (const key of keys) if (params[key] !== undefined) row[key] = params[key];
  delete row._id;
  const nameField = type === 'CATEGORY' ? 'name' : 'title', imageField = type === 'CATEGORY' ? 'icon' : 'imageUrl';
  row[nameField] = c.text(row[nameField], '名称', 1, 100);
  row[imageField] = c.text(row[imageField], '图片或图标', 1, 2000);
  for (const key of ['badge','subtitle','desc','tag','targetUrl']) if (row[key] !== undefined) row[key] = c.text(row[key], key, 0, key === 'targetUrl' ? 500 : 200);
  row.sort = c.integer(row.sort ?? 100, '排序', 0, 100000);
  const desiredStatus = (params.status === 'REVIEWING' && old ? old.desiredStatus : params.status) || old?.desiredStatus || (old?.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE');
  if (!['ACTIVE','DISABLED'].includes(desiredStatus)) throw c.error('INVALID_PARAMS', '状态无效');
  const image = row[imageField], isImage = /^(https:\/\/|cloud:\/\/)/.test(image);
  if (!isImage && (type !== 'CATEGORY' || image.length > 20 || /[:/<>]/.test(image))) throw c.error('INVALID_PARAMS', '图片须为HTTPS或云存储地址；分类可使用文字图标');
  if (type === 'CATEGORY') row.parentId = row.parentId ? c.text(row.parentId, '父级分类', 1, 100) : '';
  await safety.checkText(cloud, process.env.CONTENT_SECURITY_OPENID, [row[nameField], row.subtitle, row.badge, row.desc, row.tag, !isImage ? image : ''].filter(Boolean).join('\n'), 3);
  const version = crypto.randomUUID();
  Object.assign(row, { desiredStatus, status: isImage ? 'REVIEWING' : desiredStatus, contentSafety: { version, status: isImage ? 'PENDING' : 'PASS' }, createdAt: old?.createdAt || new Date(), updatedAt: new Date() });
  await c.transaction(db, async tx => {
    const current = await c.get(tx, collection, id);
    if (Boolean(current) !== Boolean(old) || (current?.contentSafety?.version || null) !== (old?.contentSafety?.version || null)) throw c.error('CONFLICT', '内容已变化，请刷新');
    if (type === 'CATEGORY' && row.parentId) {
      const parent = await c.get(tx, 'categories', row.parentId);
      if (row.parentId === id || !parent || parent.parentId || parent.status !== 'ACTIVE') throw c.error('INVALID_PARAMS', '父级须为启用的一级分类');
      if ((await tx.collection('categories').where({ parentId: id }).limit(1).get()).data.length) throw c.error('CATEGORY_HAS_CHILDREN', '已有子分类的分类不能降为二级');
    }
    await tx.collection(collection).doc(id).set({ data: row });
    await tx.collection('operation_logs').add({ data: { adminId: admin.adminId, action, resourceType: type, resourceId: id, createdAt: new Date() } });
  });
  if (isImage) await safety.reviewAssets(cloud, db, type, id, version, [image], process.env.CONTENT_SECURITY_OPENID);
  return { [type === 'CATEGORY' ? 'categoryId' : 'bannerId']: id, status: row.status };
}
module.exports = { saveCatalog };
