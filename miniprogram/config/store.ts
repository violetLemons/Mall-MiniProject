/**
 * 商城与自提网点通用配置 (Store & Pickup Configuration)
 * 开发者可在此自定义商城品牌名称、默认客服电话、自提网点等信息
 */

export interface StoreConfig {
  mallName: string;
  brandTitle: string;
  customerServicePhone: string;
  defaultPickupPoint: {
    pointId: string;
    pointName: string;
    address: string;
    businessHours: string;
    phone: string;
  };
}

export const STORE_CONFIG: StoreConfig = {
  mallName: '通用商城',
  brandTitle: '通用商城',
  customerServicePhone: '400-000-0000',
  defaultPickupPoint: {
    pointId: 'pt_sz_001',
    pointName: '示例大学潮流自提站',
    address: '示例省示例市示例区示例路1号示例大学生活区',
    businessHours: '09:00 - 21:30',
    phone: '13800000000'
  }
};
