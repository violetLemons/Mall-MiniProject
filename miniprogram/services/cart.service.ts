import { callCloud } from './cloud';

export interface CartItemModel {
  id: string;
  cartId?: string;
  productId: string;
  skuId?: string;
  title: string;
  skuText: string;
  price: number;
  image: string;
  count: number;
  selected: boolean;
  stock?: number;
  inStock?: boolean;
  isOnSale?: boolean;
}

export class CartService {
  /**
   * 获取购物车商品列表
   */
  static async getCart(): Promise<CartItemModel[]> {
    return callCloud<CartItemModel[]>(
      'cart',
      'getCart',
      {}
    );
  }

  /**
   * 添加商品至购物车
   */
  static async addToCart(skuId: string, count: number = 1, extraSnapshot?: any): Promise<void> {
    return callCloud<void>(
      'cart',
      'addCart',
      { skuId, count, ...extraSnapshot }
    );
  }

  /**
   * 更新购物车项数量
   */
  static async updateCount(cartId: string, count: number): Promise<void> {
    return callCloud<void>(
      'cart',
      'updateCount',
      { cartId, count }
    );
  }

  /**
   * 切换单个勾选状态
   */
  static async toggleSelect(cartId: string, selected: boolean): Promise<void> {
    return callCloud<void>(
      'cart',
      'selectCart',
      { cartId, selected }
    );
  }

  /**
   * 移除指定购物车项
   */
  static async removeItem(cartId: string): Promise<void> {
    return callCloud<void>(
      'cart',
      'removeCart',
      { cartId }
    );
  }

  /**
   * 清理所有已选中的结算商品
   */
  static async clearSelected(): Promise<void> {
    return callCloud<void>(
      'cart',
      'clearSelected',
      {}
    );
  }
}

