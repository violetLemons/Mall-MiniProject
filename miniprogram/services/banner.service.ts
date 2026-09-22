import { BannerItem } from '../models/banner';
import { callCloud } from './cloud';

export class BannerService {
  /**
   * 获取首页活动与轮播列表
   */
  static async getHomeBanners(): Promise<BannerItem[]> {
    return callCloud<BannerItem[]>(
      'products',
      'banners',
      {}
    );
  }

  /**
   * 获取潮流活动专区 4 格展示卡片
   */
  static async getPromoCards(): Promise<any[]> {
    try {
      const res = await callCloud<any[]>('products', 'promoCards', {});
      return Array.isArray(res) ? res : [];
    } catch (_) {
      return [];
    }
  }
}

