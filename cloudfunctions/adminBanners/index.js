const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');

// 将列表中的 cloud:// imageUrl 批量转临时 https（仅浏览器预览用），并附 imageFileID 供编辑回填
async function resolveCloudImages(items) {
  if (!Array.isArray(items)) return items;
  const field = 'imageUrl';
  const fileIDs = Array.from(new Set(
    items.filter(it => it && typeof it[field] === 'string' && it[field].startsWith('cloud://')).map(it => it[field])
  ));
  const urlMap = {};
  if (fileIDs.length > 0) {
    try {
      const tempRes = await cloud.getTempFileURL({ fileList: fileIDs });
      if (tempRes.fileList) {
        tempRes.fileList.forEach(f => { if (f.status === 0 && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL; });
      }
    } catch (_) {}
  }
  return items.map(it => {
    const v = it && it[field];
    const isCloud = typeof v === 'string' && v.startsWith('cloud://');
    return {
      ...it,
      [field]: isCloud && urlMap[v] ? urlMap[v] : v,
      imageFileID: isCloud ? v : ((it && it.imageFileID) ? it.imageFileID : '')
    };
  });
}

function getCommon(name) {
  try {
    return require(`./common/${name}`);
  } catch (e) {
    return require(`../common/${name}`);
  }
}

const { success, fail } = getCommon('response');
const { requireAdmin, requirePermission } = getCommon('authMiddleware');

exports.main = async (event, context) => {
  const { action, params = {} } = event;

  try {
    const admin = await requireAdmin(event, db);

    switch (action) {
      case 'uploadImage': {
        requirePermission(admin, 'banner.manage');
        const base64Data = params.base64 || '';
        const filename = params.filename || 'banner.jpg';
        if (!base64Data) return fail('INVALID_PARAMS', '请提供图片数据');

        const buffer = Buffer.from(String(base64Data).replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const rawExt = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const ext = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg';
        const cloudPath = `banners/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

        try {
          const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer });
          let url = uploadRes.fileID;
          try {
            const tempRes = await cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
            if (tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL) {
              url = tempRes.fileList[0].tempFileURL;
            }
          } catch (_) {}
          return success({ fileID: uploadRes.fileID, url });
        } catch (uploadErr) {
          console.warn('[uploadImage] cloud.uploadFile failed:', uploadErr.message);
          return fail('UPLOAD_FAILED', '图片上传失败，请重试');
        }
      }

      case 'list': {
        const res = await db.collection('banners').orderBy('sort', 'desc').get();
        return success(await resolveCloudImages(res.data));
      }

      case 'create': {
        requirePermission(admin, 'banner.manage');
        const { title, subtitle = '', imageUrl, linkType = 'PRODUCT', targetUrl, badge = '', sort = 100 } = params;
        if (!title || !imageUrl) return fail('INVALID_PARAMS', '标题和图片地址必填');

        const addRes = await db.collection('banners').add({
          data: {
            title,
            subtitle,
            imageUrl,
            linkType,
            targetUrl: targetUrl || '',
            badge,
            sort: Number(sort) || 100,
            status: 'ACTIVE',
            createdAt: db.serverDate(),
            updatedAt: db.serverDate()
          }
        });

        return success({ bannerId: addRes._id }, 'Banner创建成功');
      }

      case 'update': {
        requirePermission(admin, 'banner.manage');
        const { id, ...updateFields } = params;
        if (!id) return fail('INVALID_PARAMS', '缺少Banner ID');

        updateFields.updatedAt = db.serverDate();
        await db.collection('banners').doc(id).update({ data: updateFields });
        return success(null, 'Banner更新成功');
      }

      case 'delete': {
        requirePermission(admin, 'banner.manage');
        const { id } = params;
        if (!id) return fail('INVALID_PARAMS', '缺少Banner ID');

        await db.collection('banners').doc(id).remove();
        return success(null, 'Banner删除成功');
      }

      case 'getPromoCards': {
        const DEFAULT_PROMO_CARDS = [
          { id: 'shipping', key: 'shipping', tag: '配送服务', title: '全场包邮', desc: '极速空运实时查询', imageUrl: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=200&auto=format&fit=crop&q=80', sort: 1, type: 'PROMO_ZONE' },
          { id: 'pickup', key: 'pickup', tag: '校园服务', title: '到店自提', desc: '支持预约与核销', imageUrl: 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=200&auto=format&fit=crop&q=80', sort: 2, type: 'PROMO_ZONE' },
          { id: 'new_arrivals', key: 'new_arrivals', tag: '云端库存', title: '新品上架', desc: '实时同步在售款式', imageUrl: 'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=200&auto=format&fit=crop&q=80', sort: 3, type: 'PROMO_ZONE' },
          { id: 'size_guide', key: 'size_guide', tag: '规格参考', title: '规格指南', desc: '多规格可选', imageUrl: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=200&auto=format&fit=crop&q=80', sort: 4, type: 'PROMO_ZONE' }
        ];

        try {
          const res = await db.collection('banners').where({ type: 'PROMO_ZONE' }).orderBy('sort', 'asc').get();
          if (res.data && res.data.length > 0) {
            const map = new Map(res.data.map(item => [item.key || item.id || item.title, item]));
            const merged = DEFAULT_PROMO_CARDS.map(def => {
              const saved = map.get(def.key) || map.get(def.title);
              return saved ? { ...def, ...saved } : def;
            });
            return success(await resolveCloudImages(merged));
          }
        } catch (_) {}

        return success(DEFAULT_PROMO_CARDS);
      }

      case 'updatePromoCard': {
        requirePermission(admin, 'banner.manage');
        const { key, id, imageUrl, title, desc, tag } = params;
        const cardKey = key || id;
        if (!cardKey) return fail('INVALID_PARAMS', '缺少专区卡片标识');
        if (!imageUrl) return fail('INVALID_PARAMS', '图片地址必填');

        // 查询是否存在该卡片配置
        const existRes = await db.collection('banners').where({ type: 'PROMO_ZONE', key: cardKey }).limit(1).get();
        if (existRes.data && existRes.data.length > 0) {
          const docId = existRes.data[0]._id;
          await db.collection('banners').doc(docId).update({
            data: {
              imageUrl,
              title: title || existRes.data[0].title,
              desc: desc || existRes.data[0].desc,
              tag: tag || existRes.data[0].tag,
              updatedAt: db.serverDate()
            }
          });
        } else {
          await db.collection('banners').add({
            data: {
              type: 'PROMO_ZONE',
              key: cardKey,
              imageUrl,
              title: title || '',
              desc: desc || '',
              tag: tag || '',
              status: 'ACTIVE',
              createdAt: db.serverDate(),
              updatedAt: db.serverDate()
            }
          });
        }

        return success(null, '活动专区卡片图片更新成功');
      }

      default:
        return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
    }
  } catch (err) {
    console.error(`[adminBanners][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || 'Banner服务异常');
  }
};
