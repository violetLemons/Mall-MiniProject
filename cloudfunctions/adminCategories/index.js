const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const crypto = require('crypto');

function getCommon(name) {
  try {
    return require(`./common/${name}`);
  } catch (e) {
    return require(`../common/${name}`);
  }
}

const { success, fail } = getCommon('response');
const { requireAdmin, requirePermission } = getCommon('authMiddleware');
const { recordOperationLog } = getCommon('logger');

exports.main = async (event, context) => {
  const { action, params = {} } = event;

  try {
    const admin = await requireAdmin(event, db);
    if (['create', 'update'].includes(action)) {
      requirePermission(admin, 'category.manage');
      return success(await require('./common/catalogSafety').saveCatalog(cloud, db, admin, 'CATEGORY', action, params), '已保存，图片审核通过后生效');
    }

    switch (action) {
      case 'uploadImage': {
        requirePermission(admin, 'category.manage');
        const base64Data = params.base64 || '';
        const filename = params.filename || 'category-icon.jpg';
        if (!base64Data) return fail('INVALID_PARAMS', '请提供图片数据');

        const buffer = Buffer.from(String(base64Data).replace(/^data:image\/\w+;base64,/, ''), 'base64');
        if (!buffer.length || buffer.length > 2 * 1024 * 1024) return fail('INVALID_PARAMS', '图片须为1字节至2MB');
        const rawExt = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const ext = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg';
        const cloudPath = `categories/${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

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
        const res = await db.collection('categories').orderBy('sort', 'desc').get();
        const catData = res.data || [];

        // 收集 cloud:// 图标，批量转临时 https（仅用于浏览器预览；数据库仍存 fileID）
        const cloudIconFileIDs = Array.from(new Set(
          catData.filter(c => typeof c.icon === 'string' && c.icon.startsWith('cloud://')).map(c => c.icon)
        ));
        const urlMap = {};
        if (cloudIconFileIDs.length > 0) {
          try {
            const tempRes = await cloud.getTempFileURL({ fileList: cloudIconFileIDs });
            if (tempRes.fileList) {
              tempRes.fileList.forEach(f => {
                if (f.status === 0 && f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
              });
            }
          } catch (_) {}
        }

        // 统计关联商品数
        const list = await Promise.all(catData.map(async (cat) => {
          const catId = cat._id || cat.id;
          const count = await db.collection('products').where({
            categoryId: catId,
            status: _.neq('DELETED')
          }).count().catch(() => ({ total: 0 }));
          const isCloudIcon = typeof cat.icon === 'string' && cat.icon.startsWith('cloud://');
          return {
            ...cat,
            id: catId,
            productCount: count.total,
            icon: isCloudIcon && urlMap[cat.icon] ? urlMap[cat.icon] : cat.icon,
            iconFileID: isCloudIcon ? cat.icon : (cat.iconFileID || '')
          };
        }));
        return success(list);
      }

      case 'delete': {
        requirePermission(admin, 'category.manage');
        const { id } = params;
        if (!id) return fail('INVALID_PARAMS', '缺少分类ID');

        // 强安全外键约束：检查该分类下是否仍有商品
        const prodCount = await db.collection('products').where({
          categoryId: id,
          status: _.neq('DELETED')
        }).count();

        if (prodCount.total > 0) {
          return fail('CATEGORY_HAS_PRODUCTS', `该分类下仍有 ${prodCount.total} 款有效商品，禁止直接删除！请先将商品转移至其他分类。`);
        }

        // 强安全外键约束：一级分类下仍有二级分类时禁止删除
        const childCount = await db.collection('categories').where({ parentId: id }).count();
        if (childCount.total > 0) {
          return fail('CATEGORY_HAS_CHILDREN', `该分类下仍有 ${childCount.total} 个二级分类，禁止直接删除！请先删除或转移二级分类。`);
        }

        await db.collection('categories').doc(id).remove();

        await recordOperationLog(db, {
          adminId: admin.adminId,
          adminUsername: admin.username,
          action: 'DELETE_CATEGORY',
          resourceType: 'CATEGORY',
          resourceId: id
        });

        return success(null, '分类已安全删除');
      }

      default:
        return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
    }
  } catch (err) {
    console.error(`[adminCategories][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || '分类服务异常');
  }
};
