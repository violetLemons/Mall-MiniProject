import { ProductCategory, ProductItem } from '../../models/product';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';

Page({
  data: {
    categories: [] as ProductCategory[],      // 一级分类（主要词条）
    activeCategoryIndex: 0,
    subCategories: [] as ProductCategory[],   // 当前一级下的二级分类（次要词条）
    activeSubIndex: -1,
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
      const tree = await CategoryService.getCategoryTree();
      const list = Array.isArray(tree) ? tree : [];
      this.setData({ categories: list, errorMessage: '' });
      if (list.length > 0) {
        this.selectCategory(0);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
      this.setData({ categories: [], categoryProducts: [], errorMessage: err instanceof Error ? err.message : '云端分类加载失败，请重试' });
    }
  },

  onRetry() { this.initCategories(); },

  onSelectCategory(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    this.selectCategory(index);
  },

  /**
   * 选中一级分类：展示其二级词条，并默认加载第一个二级分类（无二级则兜底加载该一级分类）
   */
  selectCategory(index: number) {
    const cat = this.data.categories[index];
    if (!cat) return;
    const children = Array.isArray(cat.children) ? cat.children : [];
    this.setData({
      activeCategoryIndex: index,
      activeSubIndex: -1,
      subCategories: children,
      categoryProducts: [],
      scrollTop: 0
    });
    if (children.length > 0) {
      this.selectSubCategory(0);
    } else {
      this.loadCategoryProducts(cat.id);
    }
  },

  onSelectSubCategory(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    this.selectSubCategory(index);
  },

  /**
   * 选中二级分类：加载该二级分类下的商品
   */
  selectSubCategory(index: number) {
    const sub = this.data.subCategories[index];
    if (!sub) return;
    this.setData({ activeSubIndex: index, scrollTop: 0 });
    this.loadCategoryProducts(sub.id);
  },

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

  onTapProduct(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/goods/detail/index?id=${id}`
    });
  }
});
