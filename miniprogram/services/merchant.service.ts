import { callCloud, CLOUD_ENV_ID, initCloud } from './cloud';

const STORAGE_MERCHANT_KEY = 'sneaker_merchant_token';

export interface MerchantInfo {
  token: string;
  adminId: string;
  username: string;
  name: string;
  phone: string;
  address: string;
  role: string;
  permissions: string[];
  merchantId: string | null;
  subMchIdMask: string;
  expiresIn: number;
}

export interface MerchantSku {
  _id?: string;
  colorName: string;
  colorImage?: string;
  size: number | string;
  price: number; // 分
  stock: number;
  lockedStock?: number;
  status?: string;
}

export interface MerchantProduct {
  _id?: string;
  id?: string;
  name: string;
  cover: string;
  brand?: string;
  categoryId?: string;
  category?: string;
  minPrice: number; // 分
  maxPrice: number;
  totalStock: number;
  sales: number;
  status: 'ON_SALE' | 'OFF_SALE' | 'DELETED';
  tags?: string[];
  deliveryTypes?: string[];
  skus?: MerchantSku[];
  createdAt?: string;
}

export interface MerchantOrderItem {
  productId: string;
  skuId: string;
  productName: string;
  colorName: string;
  size: number | string;
  image: string;
  unitPrice: number; // 分
  count: number;
  totalAmount: number; // 分
}

export interface MerchantOrder {
  _id?: string;
  id?: string;
  orderNo: string;
  subOrderNo?: string;
  status: string;
  deliveryType: string;
  totalAmount: number; // 分
  payAmount: number; // 分
  merchantName?: string;
  items: MerchantOrderItem[];
  shipments?: { trackingNo?: string; logisticsCompany?: string; expressCompany?: string; shippedAt?: string }[];
  shippingAddress?: any;
  pickupInfo?: any;
  createdAt?: string;
  shippedAt?: string;
}

export interface MerchantInventoryLog {
  _id?: string;
  skuId: string;
  productId: string;
  delta: number;
  beforeStock: number;
  afterStock: number;
  reason: string;
  remark: string;
  adminUsername: string;
  createdAt?: string;
}

function formatYuan(cents: number | string | undefined | null): string {
  const n = Number(cents) || 0;
  return (n / 100).toFixed(2);
}

export class MerchantService {
  static getMerchant(): MerchantInfo | null {
    try {
      const raw = wx.getStorageSync(STORAGE_MERCHANT_KEY);
      return raw ? (JSON.parse(raw) as MerchantInfo) : null;
    } catch {
      return null;
    }
  }

  static saveMerchant(info: MerchantInfo): void {
    wx.setStorageSync(STORAGE_MERCHANT_KEY, JSON.stringify(info));
  }

  static updateStored(patch: Partial<MerchantInfo>): void {
    const cur = MerchantService.getMerchant();
    if (cur) MerchantService.saveMerchant({ ...cur, ...patch });
  }

  static logout(): void {
    wx.removeStorageSync(STORAGE_MERCHANT_KEY);
  }

  /**
   * 一键登录：用 getPhoneNumber 的 code 换身份，命中则签发同体系 JWT 并落本地。
   */
  static async loginByPhone(phoneCode: string): Promise<MerchantInfo> {
    const info = await callCloud<MerchantInfo>('merchantAuth', 'merchantLogin', { phoneCode });
    MerchantService.saveMerchant(info);
    return info;
  }

  /**
   * 商户端统一请求：携带 token 复用 admin 云函数；鉴权失效自动清 token。
   */
  static async request<T>(functionName: string, action: string, params: any = {}): Promise<T> {
    initCloud();
    const token = MerchantService.getMerchant()?.token || '';
    if (!wx.cloud) throw new Error('当前微信运行环境不支持云开发');

    let res: any;
    try {
      res = await wx.cloud.callFunction({
        name: functionName,
        config: { env: CLOUD_ENV_ID },
        data: { action, params, token }
      });
    } catch (e: any) {
      throw new Error(e?.errMsg || e?.message || `云函数调用失败 [${functionName}]`);
    }

    const result = res?.result as any;
    if (result && result.success) return result.data as T;

    const code = result?.code || 'BUSINESS_ERROR';
    const err: any = new Error(result?.message || '服务处理失败');
    err.code = code;
    if (code === 'AUTH_REQUIRED' || code === 'ADMIN_REQUIRED') MerchantService.logout();
    throw err;
  }

  // ---------------- 商品 ----------------
  static getProducts(params: any = {}): Promise<{ list: MerchantProduct[]; total: number; page: number; pageSize: number }> {
    return this.request('adminProducts', 'list', params);
  }

  static getProduct(id: string): Promise<{ product: any; skus: MerchantSku[] }> {
    return this.request('adminProducts', 'get', { id });
  }

  static createProduct(p: any): Promise<{ ticketId?: string; status?: string }> {
    return this.request('adminProducts', 'create', p);
  }

  static updateProduct(p: any): Promise<{ ticketId?: string; status?: string }> {
    return this.request('adminProducts', 'update', p);
  }

  static updateProductStatus(id: string, status: 'ON_SALE' | 'OFF_SALE'): Promise<any> {
    return this.request('adminProducts', 'updateStatus', { id, status });
  }

  static deleteProduct(id: string): Promise<any> {
    return this.request('adminProducts', 'delete', { id });
  }

  static uploadImage(base64: string, filename: string): Promise<{ fileID: string | null; url: string }> {
    return this.request('adminProducts', 'uploadImage', { base64, filename });
  }

  static getCategories(): Promise<any[]> {
    return this.request('adminCategories', 'list', {});
  }

  // ---------------- 订单 ----------------
  static getOrders(params: any = {}): Promise<{ list: MerchantOrder[]; total: number; hasMore?: boolean }> {
    return this.request('adminOrders', 'list', params);
  }

  static shipSubOrder(orderId: string, trackingNo: string, logisticsCompany: string): Promise<any> {
    return this.request('adminOrders', 'shipSubOrder', { orderId, trackingNo, logisticsCompany });
  }

  static reviewRefund(orderId: string, decision: 'APPROVE' | 'REJECT'): Promise<any> {
    return this.request('adminOrders', 'reviewRefund', { orderId, decision });
  }

  static syncWithWechat(orderId?: string): Promise<any> {
    return this.request('adminOrders', 'syncWithWechat', orderId ? { orderId } : {});
  }

  // ---------------- 库存 ----------------
  static getInventoryLogs(params: any = {}): Promise<{ list: MerchantInventoryLog[]; total: number }> {
    return this.request('adminInventory', 'listLogs', params);
  }

  static adjustStock(skuId: string, targetStock: number, reason: string): Promise<any> {
    return this.request('adminInventory', 'adjustStock', { skuId, targetStock, reason });
  }

  // ---------------- 商户资料 ----------------
  static updateProfile(p: { name?: string; address?: string; phone?: string }): Promise<{ name: string; address: string; phone: string }> {
    return this.request('adminUsers', 'updateProfile', p);
  }

  static setSubMchId(subMchId: string): Promise<{ subMchIdMask: string }> {
    return this.request('adminUsers', 'setSubMchId', { subMchId });
  }
}

export { formatYuan };
