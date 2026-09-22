import { AdminUser, Product, Order, Category, Banner, InventoryLog, OperationLog, SkuItem, ProductAuditTicket } from '../types';

const TOKEN_KEY = 'sneaker_admin_token';
const USER_KEY = 'sneaker_admin_user';

// 读取 CloudBase 服务网关地址 (VITE_CLOUDBASE_URL)
export function getCloudBaseUrl(): string {
  const url = (import.meta as any).env?.VITE_CLOUDBASE_URL || '';
  if (!url) {
    throw new Error('[Admin Security] 未配置 VITE_CLOUDBASE_URL，禁止启动！生产模式严禁在缺少真实云开发后端网关时进入沙箱。');
  }
  return url.replace(/\/+$/, '');
}

/**
 * 统一管理员 CloudBase HTTP 请求通道
 * 携带 Authorization: Bearer <token>
 */
export async function requestCloud<T>(functionName: string, action: string, params: any = {}): Promise<T> {
  const baseUrl = getCloudBaseUrl();
  let token = localStorage.getItem(TOKEN_KEY) || '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token.replace(/^Bearer\s+/i, '').trim()}`;
  }

  const res = await fetch(`${baseUrl}/${functionName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, params })
  });

  const json = await res.json().catch(() => ({}));
  if (!json || !json.success) {
    if (json && (json.code === 'AUTH_REQUIRED' || json.code === 'ADMIN_REQUIRED')) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    throw new Error(json?.message || `服务网关响应失败: HTTP ${res.status}`);
  }

  return json.data as T;
}

export const AdminApi = {
  // ---------------- 身份鉴权 ----------------
  login: async (username: string, password: string): Promise<{ token: string; user: AdminUser }> => {
    const data = await requestCloud<{
      token: string;
      adminId: string;
      username: string;
      role: any;
      permissions: string[];
      merchantId?: string | null;
      subMchIdMask?: string;
    }>('adminAuth', 'login', { username, password });

    const user: AdminUser = {
      id: data.adminId,
      username: data.username,
      name: data.username === 'superadmin' ? '系统超级管理员' : data.username,
      role: data.role || 'OPERATOR',
      permissions: data.permissions || [],
      merchantId: data.merchantId || null,
      subMchIdMask: data.subMchIdMask || '',
      status: 'ACTIVE',
      lastLoginAt: new Date().toLocaleString(),
      createdAt: new Date().toLocaleString()
    };
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return { token: data.token, user };
  },

  logout: async (): Promise<void> => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getCurrentUser: (): AdminUser | null => {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) return JSON.parse(raw);
      return null;
    } catch {
      return null;
    }
  },

  // ---------------- 商品与 SKU ----------------
  getProducts: async (filters?: { keyword?: string; categoryId?: string; status?: string }): Promise<Product[]> => {
    const res = await requestCloud<{ list: any[]; total: number }>('adminProducts', 'list', {
      ...filters,
      page: 1,
      pageSize: 50
    });
    return (res.list || []).map(p => ({
      id: p._id || p.id,
      name: p.name || p.title,
      title: p.title || p.name,
      brand: p.brand || '品牌',
      category: p.category || '商品',
      categoryId: p.categoryId,
      cover: p.cover || '',
      images: p.images || [p.cover || ''],
      minPrice: Number(p.minPrice) || 0,
      maxPrice: Number(p.maxPrice) || Number(p.minPrice) || 0,
      platformFee: Number(p.platformFee) || 0,
      basePrice: Number(p.basePrice) || Number(p.minPrice) || 0,
      merchantId: p.merchantId || null,
      sales: Number(p.sales) || 0,
      totalStock: Number(p.totalStock) || 0,
      status: p.status,
      tags: p.tags || [],
      isNew: Boolean(p.isNew),
      isHot: Boolean(p.isHot),
      sort: Number(p.sort) || 100,
      skus: p.skus || [],
      createdAt: p.createdAt ? new Date(p.createdAt).toLocaleString() : '',
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ''
    }));
  },

  getProductById: async (id: string): Promise<Product | null> => {
    const res = await requestCloud<{ product: any; skus: any[] }>('adminProducts', 'get', { id });
    if (!res || !res.product) return null;
    const p = res.product;
    return {
      id: p._id || p.id,
      name: p.name || p.title,
      title: p.title || p.name,
      brand: p.brand || '品牌',
      category: p.category || '商品',
      categoryId: p.categoryId,
      cover: p.cover || '',
      images: p.images || [p.cover || ''],
      minPrice: Number(p.minPrice) || 0,
      maxPrice: Number(p.maxPrice) || Number(p.minPrice) || 0,
      platformFee: Number(p.platformFee) || 0,
      basePrice: Number(p.basePrice) || Number(p.minPrice) || 0,
      merchantId: p.merchantId || null,
      sales: Number(p.sales) || 0,
      totalStock: Number(p.totalStock) || 0,
      status: p.status,
      tags: p.tags || [],
      isNew: Boolean(p.isNew),
      isHot: Boolean(p.isHot),
      sort: Number(p.sort) || 100,
      skus: (res.skus || []).map(s => ({
        id: s._id || s.id,
        skuId: s._id || s.id,
        colorName: s.colorName,
        colorImage: s.colorImage,
        size: s.size,
        price: Number(s.price) || 0,
        stock: Number(s.stock) || 0,
        lockedStock: Number(s.lockedStock) || 0,
        status: s.status || 'ACTIVE'
      })),
      createdAt: p.createdAt ? new Date(p.createdAt).toLocaleString() : '',
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toLocaleString() : ''
    };
  },

  // ---------------- 商品审核工单 ----------------
  getAuditTickets: async (status?: string): Promise<ProductAuditTicket[]> => {
    const res = await requestCloud<{ list: any[]; total: number }>('adminProducts', 'listTickets', {
      status,
      page: 1,
      pageSize: 50
    });
    return (res.list || []).map(t => ({
      id: t._id || t.id,
      merchantId: t.merchantId,
      type: t.type,
      productId: t.productId || null,
      payload: t.payload || {},
      status: t.status,
      platformFee: Number(t.platformFee) || 0,
      rejectReason: t.rejectReason || '',
      reviewedBy: t.reviewedBy || null,
      reviewedAt: t.reviewedAt ? new Date(t.reviewedAt).toLocaleString() : null,
      createdAt: t.createdAt ? new Date(t.createdAt).toLocaleString() : '',
      updatedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleString() : ''
    }));
  },

  reviewTicket: async (ticketId: string, decision: 'approve' | 'reject', platformFee?: number, rejectReason?: string): Promise<void> => {
    await requestCloud('adminProducts', 'reviewTicket', { ticketId, decision, platformFee, rejectReason });
  },

  // ---------------- 健康与环境检查 ----------------
  checkHealth: async (): Promise<{ env: string; status?: string; appEnv?: string }> => {
    const baseUrl = getCloudBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch (error: any) {
      throw new Error(error?.message || '服务网关未连接');
    }
  },

  saveProduct: async (productData: Partial<Product>): Promise<{ id?: string; ticketId?: string; pending?: boolean }> => {
    if (productData.id) {
      const res = await requestCloud<any>('adminProducts', 'update', productData);
      if (res && res.ticketId) return { ticketId: res.ticketId, pending: true };
      return { id: productData.id };
    } else {
      const res = await requestCloud<{ productId?: string; ticketId?: string }>('adminProducts', 'create', productData);
      if (res.ticketId) return { ticketId: res.ticketId, pending: true };
      return { id: res.productId };
    }
  },

  updateSkus: async (productId: string, skus: SkuItem[]): Promise<{ ticketId?: string; pending?: boolean }> => {
    const res = await requestCloud<any>('adminProducts', 'updateSkus', { id: productId, skus });
    if (res && res.ticketId) return { ticketId: res.ticketId, pending: true };
    return {};
  },

  updateProductStatus: async (id: string, status: 'ON_SALE' | 'OFF_SALE'): Promise<void> => {
    await requestCloud('adminProducts', 'updateStatus', { id, status });
  },

  softDeleteProduct: async (id: string): Promise<void> => {
    await requestCloud('adminProducts', 'delete', { id });
  },

  restoreProduct: async (id: string): Promise<void> => {
    await requestCloud('adminProducts', 'restore', { id });
  },

  purgeProduct: async (id: string): Promise<void> => {
    await requestCloud('adminProducts', 'purge', { id });
  },

  uploadProductImage: async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await requestCloud<{ fileID: string; url: string }>('adminProducts', 'uploadImage', {
            filename: file.name,
            base64
          });
          resolve(res.url || base64);
        } catch (e) {
          console.warn('[uploadProductImage] CloudBase upload fallback to base64:', e);
          resolve(reader.result as string);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // ---------------- 库存管理与流水 ----------------
  updateSkuStock: async (productId: string, skuId: string, newStock: number, reasonRemark: string): Promise<void> => {
    await requestCloud('adminInventory', 'adjustStock', {
      skuId,
      targetStock: newStock,
      reason: reasonRemark
    });
  },

  getInventoryLogs: async (): Promise<InventoryLog[]> => {
    const res = await requestCloud<{ list: any[] }>('adminInventory', 'listLogs', {
      page: 1,
      pageSize: 50
    });
    return (res.list || []).map(l => ({
      id: l._id || l.id,
      productId: l.productId,
      productName: l.productName || '商品',
      skuId: l.skuId,
      colorName: l.colorName || '',
      size: l.size || 0,
      delta: Number(l.delta) || 0,
      reason: l.reason,
      operatorName: l.adminUsername || l.operatorName || '管理员',
      remark: l.remark || '',
      createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString() : ''
    }));
  },

  // ---------------- 订单管理与校园自提 ----------------
  getOrders: async (filters?: { status?: string; deliveryType?: string; keyword?: string }): Promise<Order[]> => {
    const res = await requestCloud<{ list: any[] }>('adminOrders', 'list', {
      status: filters?.status,
      deliveryType: filters?.deliveryType,
      orderNo: filters?.keyword,
      page: 1,
      pageSize: 50
    });
    return (res.list || []).map(o => ({
      id: o._id || o.id,
      orderNo: o.orderNo,
      userId: o.userId,
      customerName: o.shippingAddress?.name || o.shippingAddress?.receiverName || '微信买家',
      customerPhone: o.shippingAddress?.phone || '',
      items: (o.items || []).map((i: any) => ({
        productId: i.productId,
        skuId: i.skuId,
        productName: i.productName,
        colorName: i.colorName,
        size: i.size,
        image: i.image,
        unitPrice: Number(i.unitPrice) || 0,
        count: Number(i.count) || 1,
        totalAmount: Number(i.totalAmount) || 0
      })),
      totalAmount: Number(o.totalAmount) || 0,
      payAmount: Number(o.payAmount) || 0,
      deliveryType: o.deliveryType,
      status: o.status,
      isTest: Boolean(o.isTest),
      trackingNo: o.trackingNo,
      logisticsCompany: o.logisticsCompany,
      shipments: o.shipments || [],
      wxShippingSync: o.wxShippingSync,
      shippingSyncStatus: o.shippingSyncStatus,
      shippingSyncError: o.shippingSyncError,
      pickupInfo: o.pickupInfo,
      shippingAddress: o.shippingAddress,
      createdAt: o.createdAt ? new Date(o.createdAt).toLocaleString() : '',
      paidAt: o.paidAt ? new Date(o.paidAt).toLocaleString() : ''
    }));
  },

  shipSubOrder: async (orderId: string, trackingNo: string, logisticsCompany?: string): Promise<void> => {
    await requestCloud('adminOrders', 'shipSubOrder', { orderId, trackingNo, logisticsCompany });
  },

  reviewRefund: async (orderId: string, decision: 'APPROVE' | 'REJECT'): Promise<void> => {
    await requestCloud('adminOrders', 'reviewRefund', { orderId, decision });
  },

  executeRefund: async (orderId: string): Promise<void> => {
    await requestCloud('adminOrders', 'executeRefund', { orderId });
  },

  retryShippingSync: async (orderId: string): Promise<any> => {
    return requestCloud('adminOrders', 'retryShippingSync', { orderId });
  },

  syncWithWechat: async (orderId?: string): Promise<any> => {
    return requestCloud('adminOrders', 'syncWithWechat', { orderId });
  },

  resolveShippingConflict: async (orderId: string, resolution: 'USE_WECHAT' | 'USE_LOCAL'): Promise<any> => {
    return requestCloud('adminOrders', 'resolveShippingConflict', { orderId, resolution });
  },

  queryWxShipping: async (orderId: string): Promise<any> => {
    return requestCloud('adminOrders', 'queryWxShipping', { orderId });
  },

  preparePickup: async (orderId: string): Promise<void> => {
    await requestCloud('adminOrders', 'preparePickup', { orderId });
  },

  completePickup: async (orderId: string): Promise<{ success: boolean; message: string }> => {
    await requestCloud('adminOrders', 'completePickup', { orderId });
    return { success: true, message: '自提订单交付完成！' };
  },

  verifyPickupCode: async (orderId: string, inputCode?: string): Promise<{ success: boolean; message: string }> => {
    await requestCloud('adminOrders', 'completePickup', { orderId });
    return { success: true, message: '自提订单交付完成！' };
  },

  testPayOrder: async (orderId: string): Promise<void> => {
    await requestCloud('testPayment', 'pay', { orderId });
  },

  testRefundOrder: async (orderId: string): Promise<void> => {
    await requestCloud('testPayment', 'refund', { orderId });
  },

  // ---------------- 分类管理 ----------------
  getCategories: async (): Promise<Category[]> => {
    const res = await requestCloud<any[]>('adminCategories', 'list', {});
    return (Array.isArray(res) ? res : []).map(c => ({
      id: c._id || c.id,
      name: c.name,
      icon: c.icon || '👟',
      iconFileID: c.iconFileID || '',
      sort: Number(c.sort) || 0,
      status: c.status || 'ACTIVE',
      productCount: Number(c.productCount) || 0,
      createdAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''
    }));
  },

  uploadCategoryImage: async (file: File): Promise<{ fileID: string | null; url: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await requestCloud<{ fileID: string | null; url: string }>('adminCategories', 'uploadImage', {
            filename: file.name,
            base64
          });
          resolve({ fileID: res.fileID, url: res.url || base64 });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  saveCategory: async (category: Partial<Category>): Promise<any> => {
    if (category.id) {
      await requestCloud('adminCategories', 'update', category);
      return category;
    } else {
      const res = await requestCloud<{ categoryId: string }>('adminCategories', 'create', category);
      return { ...category, id: res.categoryId };
    }
  },

  deleteCategory: async (id: string): Promise<void> => {
    await requestCloud('adminCategories', 'delete', { id });
  },

  // ---------------- 轮播图管理 ----------------
  getBanners: async (): Promise<Banner[]> => {
    const res = await requestCloud<any[]>('adminBanners', 'list', {});
    return (res || []).map(b => ({
      id: b._id || b.id,
      title: b.title,
      subtitle: b.subtitle || '',
      imageUrl: b.imageUrl,
      imageFileID: b.imageFileID || '',
      badge: b.badge || '',
      linkUrl: b.targetUrl || b.linkUrl || '',
      sort: Number(b.sort) || 0,
      status: b.status || 'ACTIVE',
      createdAt: b.createdAt ? new Date(b.createdAt).toLocaleDateString() : ''
    }));
  },

  uploadBannerImage: async (file: File): Promise<{ fileID: string | null; url: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await requestCloud<{ fileID: string | null; url: string }>('adminBanners', 'uploadImage', {
            filename: file.name,
            base64
          });
          resolve({ fileID: res.fileID, url: res.url || base64 });
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  saveBanner: async (banner: Partial<Banner>): Promise<any> => {
    // 只提交业务字段，避免把 imageFileID/createdAt/status 等派生字段写入数据库
    const payload = {
      title: banner.title,
      subtitle: banner.subtitle || '',
      imageUrl: banner.imageUrl,
      badge: banner.badge || '',
      targetUrl: banner.targetUrl || banner.linkUrl || '',
      sort: Number(banner.sort) || 0
    };
    if (banner.id) {
      await requestCloud('adminBanners', 'update', { id: banner.id, ...payload });
      return banner;
    } else {
      const res = await requestCloud<{ bannerId: string }>('adminBanners', 'create', payload);
      return { ...banner, id: res.bannerId };
    }
  },

  deleteBanner: async (id: string): Promise<void> => {
    await requestCloud('adminBanners', 'delete', { id });
  },

  // ---------------- 潮流活动专区 4 格展示卡片管理 ----------------
  getPromoCards: async (): Promise<any[]> => {
    const res = await requestCloud<any[]>('adminBanners', 'getPromoCards', {});
    return Array.isArray(res) ? res : [];
  },

  updatePromoCard: async (card: { key?: string; id?: string; imageUrl: string; title?: string; desc?: string; tag?: string }): Promise<void> => {
    await requestCloud('adminBanners', 'updatePromoCard', card);
  },

  // ---------------- 管理员账号 (SUPER_ADMIN 专属) ----------------
  getAdmins: async (): Promise<AdminUser[]> => {
    const res = await requestCloud<any>('adminUsers', 'list', {});
    const list = Array.isArray(res) ? res : (res?.list || []);
    return list.map((a: any) => ({
      id: a._id || a.id,
      username: a.username,
      name: a.name || (a.username === 'superadmin' ? '系统超级管理员' : a.username),
      role: a.role,
      permissions: a.permissions || [],
      merchantId: a.merchantId || null,
      subMchIdMask: a.subMchIdMask || '',
      status: a.status || 'ACTIVE',
      lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : '',
      createdAt: a.createdAt ? new Date(a.createdAt).toLocaleString() : ''
    }));
  },

  saveAdmin: async (admin: Partial<AdminUser>): Promise<any> => {
    const res = await requestCloud<{ adminId: string }>('adminUsers', 'create', admin);
    return { ...admin, id: res.adminId };
  },

  setSubMchId: async (subMchId: string, adminId?: string): Promise<{ subMchIdMask: string }> => {
    return requestCloud<{ subMchIdMask: string }>('adminUsers', 'setSubMchId', { subMchId, adminId });
  },

  toggleAdminStatus: async (adminId: string, status: 'ACTIVE' | 'DISABLED'): Promise<void> => {
    await requestCloud('adminUsers', 'toggleStatus', { adminId, status });
  },

  // ---------------- 审计日志 ----------------
  getOperationLogs: async (): Promise<OperationLog[]> => {
    const res = await requestCloud<{ list: any[] }>('adminUsers', 'operationLogs', {
      page: 1,
      pageSize: 50
    });
    return (res.list || []).map(l => ({
      id: l._id || l.id,
      adminId: l.adminId,
      adminName: l.adminUsername || '管理员',
      module: l.resourceType || '系统模块',
      action: l.action,
      targetId: l.resourceId,
      ip: l.ip || '',
      detail: JSON.stringify(l.after || l.before || l.detail || ''),
      createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString() : ''
    }));
  },

  // ---------------- 自提门店管理 ----------------
  getPickupPoints: async (): Promise<any[]> => {
    try {
      const res = await requestCloud<any[]>('pickupPoints', 'adminList', {});
      return (Array.isArray(res) ? res : []).map(p => ({
        id: p._id || p.id,
        _id: p._id || p.id,
        name: p.name,
        address: p.address,
        hours: p.hours || '09:00-22:00',
        phone: p.phone || '',
        status: p.status || 'ACTIVE'
      }));
    } catch {
      const res = await requestCloud<any[]>('pickupPoints', 'list', {});
      return (Array.isArray(res) ? res : []).map(p => ({
        id: p._id || p.id,
        _id: p._id || p.id,
        name: p.name,
        address: p.address,
        hours: p.hours || '09:00-22:00',
        phone: p.phone || '',
        status: p.status || 'ACTIVE'
      }));
    }
  },

  savePickupPoint: async (point: any): Promise<any> => {
    return await requestCloud('pickupPoints', 'save', point);
  },

  deletePickupPoint: async (id: string): Promise<any> => {
    return await requestCloud('pickupPoints', 'delete', { id });
  }
};
