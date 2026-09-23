import { ProductCategory } from '../../models/product';
import { CategoryService } from '../../services/category.service';

const IMAGE_ICON_REGEX = /^(https?:\/\/|cloud:\/\/|\/|data:image\/(?:png|jpeg|webp|svg\+xml)[;,])/i;

Page({
  data: {
    categories: [] as ProductCategory[],      // 一级分类（主要词条）
    activeCategoryIndex: 0,
    subCategories: [] as any[],               // 当前一级下的二级分类（含格式化图标信息）
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
      this.setData({ categories: [], subCategories: [], errorMessage: err instanceof Error ? err.message : '云端分类加载失败，请重试' });
    }
  },

  onRetry() { this.initCategories(); },

  /**
   * 点击一级分类：展开其二级网格（无二级则右侧显示空状态，不跳转）
   */
  onSelectCategory(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    this.selectCategory(index);
  },

  selectCategory(index: number) {
    const cat = this.data.categories[index];
    if (!cat) return;
    const children = Array.isArray(cat.children) ? cat.children : [];
    this.setData({
      activeCategoryIndex: index,
      subCategories: this.formatSubCategories(children),
      scrollTop: 0
    });
  },

  formatSubCategories(children: ProductCategory[]): any[] {
    return children.map(item => {
      const iconStr = typeof item.icon === 'string' ? item.icon.trim() : '';
      const isImageIcon = IMAGE_ICON_REGEX.test(iconStr);
      return {
        id: item.id || (item as any)._id,
        name: item.name,
        icon: item.icon,
        isImageIcon,
        iconDisplay: !isImageIcon && Array.from(iconStr).length <= 4 ? (iconStr || '🛍️') : '🛍️'
      };
    });
  },

  /**
   * 点击二级分类：跳转商品列表页，标题带上「一级 · 二级」
   */
  onSelectSubCategory(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    const sub = this.data.subCategories[index];
    if (!sub) return;
    const level1 = this.data.categories[this.data.activeCategoryIndex];
    const level1Name = level1 ? level1.name : '';
    const categoryName = level1Name ? `${level1Name} · ${sub.name}` : sub.name;
    wx.navigateTo({
      url: `/pages/goods/list/index?categoryId=${sub.id}&categoryName=${encodeURIComponent(categoryName)}`
    });
  },

  onSubIconError(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isInteger(index) && this.data.subCategories[index]) {
      this.setData({
        [`subCategories[${index}].isImageIcon`]: false,
        [`subCategories[${index}].iconDisplay`]: '🛍️'
      });
    }
  }
});
