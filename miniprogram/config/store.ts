/**
 * 商城公开配置；上线前填写真实品牌和客服电话。
 */

export interface StoreConfig {
  mallName: string;
  brandTitle: string;
  customerServicePhone: string;
}

export const STORE_CONFIG: StoreConfig = {
  mallName: '通用商城',
  brandTitle: '通用商城',
  customerServicePhone: ''
};
