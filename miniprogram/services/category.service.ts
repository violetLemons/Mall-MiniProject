import { ProductCategory } from '../models/product';
import { callCloud } from './cloud';

export class CategoryService {
  /**
   * 获取首页快捷分类/金刚区（仅一级分类/主要词条）
   */
  static async getQuickCategories(): Promise<ProductCategory[]> {
    const list = await callCloud<ProductCategory[]>(
        'products',
        'categories',
        { parentId: '' }
    );
    if (!Array.isArray(list)) throw new Error('分类响应格式异常');
    return list;
  }

  /**
   * 获取两级分类树（一级分类内嵌 children 二级分类数组，供分类页）
   */
  static async getCategoryTree(): Promise<ProductCategory[]> {
    const tree = await callCloud<ProductCategory[]>(
        'products',
        'categoryTree',
        {}
    );
    if (!Array.isArray(tree)) throw new Error('分类树响应格式异常');
    return tree;
  }
}
