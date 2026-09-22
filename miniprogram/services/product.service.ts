import { PaginatedList } from '../models/common';
import { ProductItem, ProductQueryParams } from '../models/product';
import { callCloud } from './cloud';

export class ProductService {
  /**
   * 获取首页推荐商品 (猜你喜欢)
   */
  static async getRecommendList(page: number = 1, pageSize: number = 6): Promise<PaginatedList<ProductItem>> {
    return await callCloud<PaginatedList<ProductItem>>(
        'products',
        'recommend',
        { page, pageSize }
      );
  }

  /**
   * 获取商品列表 (支持分类筛选、关键字搜索、多维度排序与分页)
   */
  static async getList(params: ProductQueryParams): Promise<PaginatedList<ProductItem>> {
    return await callCloud<PaginatedList<ProductItem>>(
        'products',
        'list',
        params
      );
  }

  /**
   * 获取单件商品详情 (含多规格 SKU 矩阵)
   */
  static async getDetail(id: string): Promise<ProductItem | null> {
    return await callCloud<ProductItem | null>(
        'products',
        'detail',
        { id }
      );
  }
}
