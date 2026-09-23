export type AdminRole = 'SUPER_ADMIN' | 'OPERATOR' | 'WAREHOUSE' | 'MERCHANT';

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: AdminRole;
  permissions: string[];
  merchantId?: string | null;
  subMchIdMask?: string;
  status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' | 'DELETED';
  lastLoginAt?: string;
  createdAt: string;
}

export interface ProductAuditTicket {
  id: string;
  merchantId: string;
  type: 'CREATE' | 'UPDATE';
  productId?: string | null;
  payload: {
    product?: any;
    skus?: SkuItem[] | null;
  };
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  platformFee?: number;
  rejectReason?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkuItem {
  id?: string;
  skuId?: string;
  colorName: string;
  colorImage?: string;
  size: number;
  price: number;
  costPrice?: number;
  stock: number;
  lockedStock?: number;
  status: 'ACTIVE' | 'DISABLED';
}

export interface Product {
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
  platformFee?: number;
  basePrice?: number;
  merchantId?: string | null;
  sales: number;
  totalStock: number;
  status: 'ON_SALE' | 'OFF_SALE' | 'DELETED';
  tags: string[];
  isNew: boolean;
  isHot: boolean;
  sort: number;
  skus: SkuItem[];
  deliveryTypes?: ('DELIVERY' | 'PICKUP')[];
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
  deliveryType: 'DELIVERY' | 'PICKUP';
  status: 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'WAITING_PICKUP' | 'READY_FOR_PICKUP' | 'COMPLETED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDING' | 'REFUNDED';
  isTest?: boolean;
  merchantId?: string | null;
  subOrderNo?: string;
  parentOrderId?: string;
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
  pickupInfo?: {
    pointId: string;
    pointName: string;
    pickupCode?: string;
    pickupStatus: 'PREPARING' | 'READY' | 'COMPLETED' | 'PICKED';
    pickedUpAt?: string;
  };
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
  status: 'ACTIVE' | 'DISABLED';
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
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  skuId: string;
  colorName: string;
  size: number;
  delta: number;
  reason: 'MANUAL_ADJUST' | 'ORDER_LOCK' | 'ORDER_CANCEL' | 'RESTOCK';
  operatorName: string;
  remark: string;
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
