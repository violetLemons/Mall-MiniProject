import { ProductCategory, ProductItem } from '../../models/product';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';

Page({
  data: {
    categories: [] as ProductCategory[],
    activeCategoryIndex: 0,
    categoryProducts: [] as ProductItem[],
    loading: false,
    scrollTop: 0,
    errorMessage: ''
  },

  onLoad() {
    this.initCategories();
  },

  async initCategories() {
    try {
      const categories = await CategoryService.getQuickCategories();
      const list = Array.isArray(categories) ? categories : [];
      this.setData({ categories: list, errorMessage: '' });
      if (list.length > 0) {
        this.loadCategoryProducts(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
      this.setData({ categories: [], categoryProducts: [], errorMessage: err instanceof Error ? err.message : '云端分类加载失败，请重试' });
    }
  },

  onRetry() { this.initCategories(); },

  async loadCategoryProducts(categoryId: string) {
    this.setData({ loading: true });
    try {
      const res = await ProductService.getList({
        categoryId,
        pageSize: 10
      });
      this.setData({
        categoryProducts: res.list,
        loading: false
      });
    } catch (err) {
      console.error(err);
      this.setData({ loading: false, errorMessage: err instanceof Error ? err.message : '商品加载失败，请重试' });
    }
  },

  onSelectCategory(e: any) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      activeCategoryIndex: index,
      scrollTop: 0
    });
    const cat = this.data.categories[index];
    if (cat) {
      this.loadCategoryProducts(cat.id);
    }
  },

  onTapProduct(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/goods/detail/index?id=${id}`
    });
  }
});
