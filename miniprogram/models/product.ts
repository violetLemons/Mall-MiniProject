/**
 * 通用商城商品与 SKU 模型体系
 */

export interface ShoeSize {
  size: number;        // 规格
  inStock: boolean;    // 是否有货
  stockCount: number;  // 剩余库存
}

export interface ShoeColor {
  id: string;
  name: string;
  image: string;
}

export interface ProductSku {
  skuId: string;
  colorId: string;
  colorName: string;
  size: number;
  price: number;
  originalPrice: number;
  stock: number;
  image: string;
}

export type ProductBadgeType = '新品' | '学生价' | '限时' | '热卖' | '爆款';

export interface ProductItem {
  id: string;
  title: string;
  subtitle: string;
  brand: string;
  category: string;
  categoryId: string;
  cover: string;
  images: string[];
  price: number;
  originalPrice: number;
  sales: number;
  tags: ProductBadgeType[];
  isHot?: boolean;
  isNew?: boolean;
  colors: ShoeColor[];
  sizes: ShoeSize[];
  skus: ProductSku[];
  detailImages?: string[];
  description?: string;
  shippingType?: ('express' | 'store_pickup')[];
}

export interface ProductCategory {
  id: string;
  name: string;
  icon: string;
  badge?: string;
}

export type SortType = 'default' | 'sales' | 'newest' | 'price_asc' | 'price_desc';

export interface ProductQueryParams {
  categoryId?: string;
  keyword?: string;
  sort?: SortType;
  page?: number;
  pageSize?: number;
}
