import { BannerItem } from '../../models/banner';
import { ProductCategory, ProductItem } from '../../models/product';
import { BannerService } from '../../services/banner.service';
import { CategoryService } from '../../services/category.service';
import { ProductService } from '../../services/product.service';

Page({
  data: {
    banners: [] as BannerItem[],
    bannerCurrent: 0,
    categories: [] as ProductCategory[],
    promoCards: [] as any[],
    productList: [] as ProductItem[],
    page: 1,
    pageSize: 6,
    hasMore: true,
    initialLoading: false,
    loadingMore: false,
    errorMessage: ''
  },

  onLoad() {
    this.initData();
  },

  async initData() {
    this.setData({ initialLoading: true, errorMessage: '' });
    try {
      const [banners, categories, productRes] = await Promise.all([
        BannerService.getHomeBanners(),
        CategoryService.getQuickCategories(),
        ProductService.getRecommendList(1, this.data.pageSize)
        // [隐藏] 潮流活动专区已下线，暂停加载：BannerService.getPromoCards()
      ]);

      this.setData({
        banners,
        categories,
        promoCards: [], // [隐藏] 不加载
        productList: productRes.list,
        page: 1,
        hasMore: productRes.hasMore,
        initialLoading: false,
        errorMessage: ''
      });
    } catch (err) {
      console.error('Failed to init home data:', err);
      this.setData({ initialLoading: false, errorMessage: err instanceof Error ? err.message : '云端数据加载失败，请重试' });
    }
  },

  onRetry() { this.initData(); },

  onBannerChange(e: any) {
    this.setData({ bannerCurrent: e.detail.current });
  },

  onTapBanner(e: any) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({ url });
    }
  },

  async onPullDownRefresh() {
    await this.initData();
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return;

    this.setData({ loadingMore: true });
    const nextPage = this.data.page + 1;
    try {
      const res = await ProductService.getRecommendList(nextPage, this.data.pageSize);
      this.setData({
        productList: [...this.data.productList, ...res.list],
        page: nextPage,
        hasMore: res.hasMore,
        loadingMore: false
      });
    } catch (err) {
      console.error('Failed to load more products:', err);
      this.setData({ loadingMore: false });
    }
  }
});
