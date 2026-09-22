/**
 * 商品展示服务云函数
 * 提供商品聚合列表、分类检索、猜你喜欢瀑布流及多规格 SKU 2D 矩阵查询
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function success(data = null, message = '操作成功') {
  return {
    success: true,
    code: 'OK',
    message,
    data,
    requestId: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    serverTime: Date.now()
  };
}

function fail(code = 'SYSTEM_ERROR', message = '系统内部错误') {
  const dbUnavailable = /(?:collection|database).*(?:not.?exist|not found|不存在|权限)|(?:not.?exist|not found|不存在).*(?:collection|database)/i.test(String(message || ''));
  if (dbUnavailable) {
    return {
      success: false,
      code: 'DB_NOT_READY',
      message: '云端数据库尚未初始化，请在云开发控制台完成集合配置后重试',
      data: null,
      requestId: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      serverTime: Date.now()
    };
  }
  const safe = typeof code === 'string' && /^[A-Z_]{3,50}$/.test(code) && !['SYSTEM_ERROR', 'CONFIG_ERROR'].includes(code);
  return {
    success: false,
    code: safe ? code : 'SYSTEM_ERROR',
    message: message || '服务暂时不可用，请稍后重试',
    data: null,
    requestId: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    serverTime: Date.now()
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 统一 ProductDTO 转换函数 (保障小程序 ProductItem 契约一致)
 */
function formatProductDTO(p) {
  const id = p._id || p.id;
  const title = p.title || p.name || '通用商品';
  const price = typeof p.price === 'number' ? p.price : (typeof p.minPrice === 'number' ? p.minPrice : 0);
  const originalPrice = p.originalPrice || p.maxPrice || price;

  return {
    id,
    _id: id,
    title,
    name: title,
    subtitle: p.subtitle || '',
    brand: p.brand || '',
    category: p.category || '',
    categoryId: p.categoryId || '',
    cover: p.cover || '',
    images: p.images || (p.cover ? [p.cover] : []),
    detailImages: p.detailImages || [],
    price,
    minPrice: price,
    maxPrice: p.maxPrice || price,
    originalPrice,
    sales: Number(p.sales) || 0,
    totalStock: Number(p.totalStock) || 0,
    tags: Array.isArray(p.tags) ? p.tags : [],
    isHot: Boolean(p.isHot),
    isNew: Boolean(p.isNew),
    colors: p.colors || [],
    sizes: p.sizes || [],
    skus: p.skus || [],
    description: p.description || '',
    status: p.status || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

exports.main = async (event, context) => {
  const { action, params = {} } = event;

  try {
    switch (action) {
      /**
       * 1. 首页推荐商品 (猜你喜欢瀑布流)
       */
      case 'recommend': {
        const page = Math.max(Number(params.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(params.pageSize) || 6, 1), 20);

        const query = {
          status: 'ON_SALE',
          deletedAt: null
        };

        const countRes = await db.collection('products').where(query).count();
        const listRes = await db.collection('products')
          .where(query)
          .orderBy('sort', 'desc')
          .orderBy('sales', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get();

        return success({
          list: listRes.data.map(formatProductDTO),
          total: countRes.total,
          page,
          pageSize,
          hasMore: page * pageSize < countRes.total
        });
      }

      /**
       * 2. 商品列表 (支持分类筛选、关键词搜索与多维度排序)
       */
      case 'list': {
        const page = Math.max(Number(params.page) || 1, 1);
        const pageSize = Math.min(Math.max(Number(params.pageSize) || 6, 1), 20);

        const query = {
          status: 'ON_SALE',
          deletedAt: null
        };

        if (params.categoryId) {
          query.categoryId = params.categoryId;
        }

        if (params.keyword && params.keyword.trim()) {
          const safeKeyword = escapeRegex(params.keyword.trim());
          query.name = db.RegExp({
            regexp: safeKeyword,
            options: 'i'
          });
        }

        let orderField = 'sort';
        let orderDir = 'desc';

        switch (params.sort) {
          case 'sales':
            orderField = 'sales';
            orderDir = 'desc';
            break;
          case 'newest':
            orderField = 'createdAt';
            orderDir = 'desc';
            break;
          case 'price_asc':
            orderField = 'minPrice';
            orderDir = 'asc';
            break;
          case 'price_desc':
            orderField = 'minPrice';
            orderDir = 'desc';
            break;
          default:
            orderField = 'sort';
            orderDir = 'desc';
            break;
        }

        const countRes = await db.collection('products').where(query).count();
        const listRes = await db.collection('products')
          .where(query)
          .orderBy(orderField, orderDir)
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get();

        return success({
          list: listRes.data.map(formatProductDTO),
          total: countRes.total,
          page,
          pageSize,
          hasMore: page * pageSize < countRes.total
        });
      }

      /**
       * 3. 商品详情页与 2D SKU 矩阵聚合
       */
      case 'detail': {
        const { id } = params;
        if (!id) return fail('INVALID_PARAMS', '缺少商品ID');

        const prodRes = await db.collection('products').doc(id).get().catch(() => null);
        if (!prodRes || !prodRes.data || prodRes.data.status !== 'ON_SALE') {
          return fail('PRODUCT_OFF_SALE', '该商品已下架或不存在');
        }

        const skusRes = await db.collection('product_skus')
          .where({
            productId: id,
            status: 'ACTIVE'
          })
          .orderBy('size', 'asc')
          .get();

        const product = prodRes.data;
        const skus = skusRes.data || [];

        // 提取颜色列表与规格列表，计算 2D 矩阵与可用库存
        const colorMap = new Map();
        const sizeSet = new Set();

        const formattedSkus = skus.map(sku => {
          // 计算可用库存: 物理库存扣减锁定库存
          const availableStock = Math.max((sku.stock || 0) - (sku.lockedStock || 0), 0);
          const colorName = sku.colorName || '默认配色';
          const colorId = sku.colorId || colorName;

          if (!colorMap.has(colorId)) {
            colorMap.set(colorId, {
              id: colorId,
              name: colorName,
              image: sku.colorImage || product.cover
            });
          }

          const sizeNum = Number(sku.size);
          sizeSet.add(sizeNum);

          return {
            id: sku._id || sku.id,
            _id: sku._id || sku.id,
            skuId: sku._id || sku.id,
            productId: sku.productId,
            skuCode: sku.skuCode,
            colorId,
            colorName,
            colorImage: sku.colorImage || product.cover,
            image: sku.colorImage || product.cover,
            size: sizeNum,
            price: sku.price,
            originalPrice: sku.originalPrice || product.originalPrice || sku.price,
            stock: sku.stock,
            lockedStock: sku.lockedStock || 0,
            availableStock,
            inStock: availableStock > 0
          };
        });

        // 排序规格
        const sortedSizes = Array.from(sizeSet).sort((a, b) => a - b).map(s => ({
          size: s,
          inStock: formattedSkus.some(sku => sku.size === s && sku.inStock)
        }));

        return success(formatProductDTO({
          ...product,
          price: product.minPrice,
          colors: Array.from(colorMap.values()),
          sizes: sortedSizes,
          skus: formattedSkus
        }));
      }

      /**
       * 4. 快捷分类
       */
      case 'categories': {
        const res = await db.collection('categories')
          .where({ status: 'ACTIVE' })
          .orderBy('sort', 'desc')
          .get();

        return success(res.data || []);
      }

      /**
       * 5. 首页营销轮播
       */
      case 'banners': {
        const res = await db.collection('banners')
          .where({ status: 'ACTIVE' })
          .orderBy('sort', 'desc')
          .get();
        // 过滤掉专区卡片，只返回顶部轮播
        const list = (res.data || []).filter(b => b.type !== 'PROMO_ZONE');
        return success(list);
      }

      /**
       * 6. 潮流活动专区 4 格展示卡片
       */
      case 'promoCards': {
        try {
          const res = await db.collection('banners')
            .where({ type: 'PROMO_ZONE' })
            .orderBy('sort', 'asc')
            .get();
          if (res.data && res.data.length > 0) {
            return success(res.data);
          }
        } catch (_) {}

        try {
          const res2 = await db.collection('promo_cards')
            .orderBy('sort', 'asc')
            .get();
          if (res2.data && res2.data.length > 0) {
            return success(res2.data);
          }
        } catch (_) {}

        return success([]);
      }

      default:
        return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
    }
  } catch (err) {
    console.error(`[products][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || '商品服务异常');
  }
};
