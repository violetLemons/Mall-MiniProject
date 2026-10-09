/**
 * 商城公开配置；上线前填写真实品牌和客服电话。
 */

export interface StoreConfig {
  mallName: string;
  brandTitle: string;
  customerServicePhone: string;
}

export const STORE_CONFIG: StoreConfig = {
  mallName: '水果商城',
  brandTitle: '水果商城',
  customerServicePhone: ''
};
