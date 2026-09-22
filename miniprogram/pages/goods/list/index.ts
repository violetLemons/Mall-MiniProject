import { ProductItem, SortType } from '../../../models/product';
import { CategoryService } from '../../../services/category.service';
import { ProductService } from '../../../services/product.service';

Page({
  data: {
    title: '商品库',
    categoryId: '',
    categoryName: '',
    keyword: '',
    currentSort: 'default' as SortType,
    priceOrder: 'none' as 'none' | 'asc' | 'desc', // 价格单独升降序指示
    categoryTabs: [{ id: '', name: '全部' }],
    sortTabs: [
      { key: 'default', label: '综合' },
      { key: 'sales', label: '销量' },
      { key: 'newest', label: '新品' },
      { key: 'price', label: '价格' }
    ],
    productList: [] as ProductItem[],
    page: 1,
    pageSize: 6,
    hasMore: true,
    initialLoading: true,
    loadingMore: false,
    errorMessage: ''
  },

  onLoad(options: any) {
    let catId = options.categoryId || '';
    let kw = options.keyword ? decodeURIComponent(options.keyword) : '';
    let catName = options.categoryName ? decodeURIComponent(options.categoryName) : '';

    this.setData({
      categoryId: catId,
      keyword: kw,
      categoryName: catName,
      title: catName || '商品库'
    });

    this.loadCategories();
    this.loadProducts(true);
  },

  async loadCategories() {
    try {
      const categories = await CategoryService.getQuickCategories();
      const tabs = [{ id: '', name: '全部' }, ...(Array.isArray(categories) ? categories : [])];
      this.setData({ categoryTabs: tabs });
    } catch (err) {
      console.error('Failed to load categories:', err);
      // 保留“全部”入口，但不注入本地伪造分类；商品接口错误会在页面中单独展示。
      this.setData({ categoryTabs: [{ id: '', name: '全部' }] });
    }
  },

  async loadProducts(reset: boolean = false) {
    if (reset) {
      this.setData({
        page: 1,
        hasMore: true,
        initialLoading: true,
        errorMessage: ''
      });
    }

    const currentPage = reset ? 1 : this.data.page;

    try {
      const res = await ProductService.getList({
        categoryId: this.data.categoryId,
        keyword: this.data.keyword,
        sort: this.data.currentSort,
        page: currentPage,
        pageSize: this.data.pageSize
      });

      this.setData({
        productList: reset ? res.list : [...this.data.productList, ...res.list],
        page: currentPage,
        hasMore: res.hasMore,
        initialLoading: false,
        loadingMore: false,
        errorMessage: ''
      });
    } catch (err) {
      console.error('Failed to load product list:', err);
      this.setData({ initialLoading: false, loadingMore: false, errorMessage: err instanceof Error ? err.message : '云端商品加载失败，请重试' });
    }
  },

  onRetry() { this.loadProducts(true); },

  onSortTab(e: any) {
    const key = e.currentTarget.dataset.key;
    let nextSort: SortType = 'default';
    let nextPriceOrder: 'none' | 'asc' | 'desc' = 'none';

    if (key === 'price') {
      if (this.data.currentSort === 'price_asc') {
        nextSort = 'price_desc';
        nextPriceOrder = 'desc';
      } else {
        nextSort = 'price_asc';
        nextPriceOrder = 'asc';
      }
    } else {
      nextSort = key as SortType;
      nextPriceOrder = 'none';
    }

    this.setData({
      currentSort: nextSort,
      priceOrder: nextPriceOrder
    }, () => {
      this.loadProducts(true);
    });
  },

  onCategorySelect(e: any) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.categoryTabs.find(c => c.id === id);
    this.setData({
      categoryId: id,
      categoryName: item ? item.name : '',
      title: item && item.id ? item.name : '商品库'
    }, () => {
      this.loadProducts(true);
    });
  },

  onSearchConfirm(e: any) {
    const kw = e.detail.value;
    this.setData({ keyword: kw }, () => {
      this.loadProducts(true);
    });
  },

  onSearchClear() {
    this.setData({ keyword: '' }, () => {
      this.loadProducts(true);
    });
  },

  onResetSearch() {
    this.setData({
      keyword: '',
      categoryId: '',
      currentSort: 'default',
      priceOrder: 'none'
    }, () => {
      this.loadProducts(true);
    });
  },

  async onPullDownRefresh() {
    await this.loadProducts(true);
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.initialLoading) return;

    this.setData({ loadingMore: true });
    this.setData({ page: this.data.page + 1 }, () => {
      this.loadProducts(false);
    });
  }
});
