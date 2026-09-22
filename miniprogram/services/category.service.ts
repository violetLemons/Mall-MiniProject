import { ProductCategory } from '../models/product';
import { callCloud } from './cloud';

export class CategoryService {
  /**
   * 获取首页快捷分类/金刚区
   */
  static async getQuickCategories(): Promise<ProductCategory[]> {
    const list = await callCloud<ProductCategory[]>(
        'products',
        'categories',
        {}
    );
    if (!Array.isArray(list)) throw new Error('分类响应格式异常');
    return list;
  }
}
