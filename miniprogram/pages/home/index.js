"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const banner_service_1 = require("../../services/banner.service");
const category_service_1 = require("../../services/category.service");
const product_service_1 = require("../../services/product.service");
Page({
    data: {
        banners: [],
        bannerCurrent: 0,
        categories: [],
        promoCards: [],
        productList: [],
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
    initData() {
        return __awaiter(this, void 0, void 0, function* () {
            this.setData({ initialLoading: true, errorMessage: '' });
            try {
                const [banners, categories, productRes] = yield Promise.all([
                    banner_service_1.BannerService.getHomeBanners(),
                    category_service_1.CategoryService.getQuickCategories(),
                    product_service_1.ProductService.getRecommendList(1, this.data.pageSize)
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
            }
            catch (err) {
                console.error('Failed to init home data:', err);
                this.setData({ initialLoading: false, errorMessage: err instanceof Error ? err.message : '云端数据加载失败，请重试' });
            }
        });
    },
    onRetry() { this.initData(); },
    onBannerChange(e) {
        this.setData({ bannerCurrent: e.detail.current });
    },
    onTapBanner(e) {
        const url = e.currentTarget.dataset.url;
        if (url) {
            wx.navigateTo({ url });
        }
    },
    onPullDownRefresh() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initData();
            wx.stopPullDownRefresh();
        });
    },
    onReachBottom() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.data.hasMore || this.data.loadingMore)
                return;
            this.setData({ loadingMore: true });
            const nextPage = this.data.page + 1;
            try {
                const res = yield product_service_1.ProductService.getRecommendList(nextPage, this.data.pageSize);
                this.setData({
                    productList: [...this.data.productList, ...res.list],
                    page: nextPage,
                    hasMore: res.hasMore,
                    loadingMore: false
                });
            }
            catch (err) {
                console.error('Failed to load more products:', err);
                this.setData({ loadingMore: false });
            }
        });
    }
});
