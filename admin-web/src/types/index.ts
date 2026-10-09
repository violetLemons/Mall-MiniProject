export type AdminRole = 'SUPER_ADMIN';

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  phone?: string;
  address?: string;
  role: AdminRole;
  permissions: string[];
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'DELETED';
  lastLoginAt?: string;
  createdAt: string;
}


export interface SkuItem {
  id?: string;
  skuId?: string;
  colorName: string;
  colorImage?: string;
  size: number;
  price: number;
  costPrice?: number;
  status: 'ACTIVE' | 'DISABLED';
}

export interface Product {
  contentSafety?: { status: string; version: string };
  id: string;
  name: string;
  title?: string;
  subtitle?: string;
  description?: string;
  brand: string;
  category: string;
  categoryId: string;
  cover: string;
  images: string[];
  detailImages?: string[];
  minPrice: number;
  maxPrice: number;
  price?: number;
  originalPrice?: number;
  basePrice?: number;
  sales: number;
  status: 'ON_SALE' | 'OFF_SALE' | 'DELETED';
  tags: string[];
  isNew: boolean;
  isHot: boolean;
  sort: number;
  skus: SkuItem[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface OrderItem {
  productId: string;
  skuId: string;
  productName: string;
  colorName: string;
  size: number | string;
  image: string;
  unitPrice: number;
  count: number;
  totalAmount: number;
}

export interface Order {
  id: string;
  orderNo: string;
  userId: string;
  customerName?: string;
  customerPhone?: string;
  items: OrderItem[];
  totalAmount: number;
  payAmount: number;
  balanceAmount?: number;
  refundNo?: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'CLOSING' | 'COMPLETED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDING' | 'REFUNDED';
  isTest?: boolean;
  shipments?: { trackingNo?: string; logisticsCompany?: string; expressCompany?: string; shippedAt?: string }[];
  trackingNo?: string;
  logisticsCompany?: string;
  wxShippingSync?: {
    status: string; // 'synced' | 'failed' | 'conflict'
    source?: string; // 'mall' | 'wechat' | 'both'
    type?: string;
    syncedAt?: string;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    retryCount?: number;
    message?: string;
    conflictDetail?: {
      local: { trackingNo?: string; logisticsCompany?: string; shippedAt?: string };
      wechat: { trackingNo?: string; expressCompany?: string; logisticsCompany?: string; uploadTime?: string };
    };
  };
  shippingSyncStatus?: string;
  shippingSyncError?: string;
  shippingAddress?: {
    name?: string;
    receiverName?: string;
    phone: string;
    province: string;
    city: string;
    district?: string;
    detail: string;
  };
  createdAt: string;
  paidAt?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  iconFileID?: string;
  parentId?: string;
  badge?: string;
  sort: number;
  status: 'ACTIVE' | 'DISABLED' | 'REVIEWING';
  productCount: number;
  createdAt?: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageFileID?: string;
  badge?: string;
  targetUrl?: string;
  linkUrl?: string;
  sort: number;
  status: 'ACTIVE' | 'DISABLED' | 'REVIEWING';
  createdAt: string;
}

export interface OperationLog {
  id: string;
  adminId: string;
  adminName: string;
  module: string;
  action: string;
  targetId?: string;
  ip: string;
  detail: string;
  createdAt: string;
}

export interface CardKey {
  id: string;
  code: string;
  status: 'UNUSED' | 'USED' | 'DISABLED';
  type: string;
  benefit: string;
  value: number; // 分
  expireAt: string | null;
  batchId: string;
  redeemedBy: string;
  redeemedAt: string | null;
  createdAt: string | null;
}

export interface AdConfig {
  name: string;
  adUnitId: string;
  rewardAmount: number; // 分
  dailyLimit: number; // 每用户每日上限
  enabled: boolean;
  updatedAt?: string | null;
}

export interface AdStats {
  totalCount: number; // 累计观看次数
  totalRewarded: number; // 累计发放额度（分）
  todayCount: number; // 今日观看次数
  todayRewarded: number; // 今日发放额度（分）
}
