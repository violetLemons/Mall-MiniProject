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
const category_service_1 = require("../../../services/category.service");
const product_service_1 = require("../../../services/product.service");
Page({
    data: {
        title: '商品库',
        categoryId: '',
        categoryName: '',
        keyword: '',
        currentSort: 'default',
        priceOrder: 'none', // 价格单独升降序指示
        categoryTabs: [{ id: '', name: '全部' }],
        sortTabs: [
            { key: 'default', label: '综合' },
            { key: 'sales', label: '销量' },
            { key: 'newest', label: '新品' },
            { key: 'price', label: '价格' }
        ],
        productList: [],
        page: 1,
        pageSize: 6,
        hasMore: true,
        initialLoading: true,
        loadingMore: false,
        errorMessage: ''
    },
    onLoad(options) {
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
    loadCategories() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const categories = yield category_service_1.CategoryService.getQuickCategories();
                const tabs = [{ id: '', name: '全部' }, ...(Array.isArray(categories) ? categories : [])];
                this.setData({ categoryTabs: tabs });
            }
            catch (err) {
                console.error('Failed to load categories:', err);
                // 保留“全部”入口，但不注入本地伪造分类；商品接口错误会在页面中单独展示。
                this.setData({ categoryTabs: [{ id: '', name: '全部' }] });
            }
        });
    },
    loadProducts() {
        return __awaiter(this, arguments, void 0, function* (reset = false) {
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
                const res = yield product_service_1.ProductService.getList({
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
            }
            catch (err) {
                console.error('Failed to load product list:', err);
                this.setData({ initialLoading: false, loadingMore: false, errorMessage: err instanceof Error ? err.message : '云端商品加载失败，请重试' });
            }
        });
    },
    onRetry() { this.loadProducts(true); },
    onSortTab(e) {
        const key = e.currentTarget.dataset.key;
        let nextSort = 'default';
        let nextPriceOrder = 'none';
        if (key === 'price') {
            if (this.data.currentSort === 'price_asc') {
                nextSort = 'price_desc';
                nextPriceOrder = 'desc';
            }
            else {
                nextSort = 'price_asc';
                nextPriceOrder = 'asc';
            }
        }
        else {
            nextSort = key;
            nextPriceOrder = 'none';
        }
        this.setData({
            currentSort: nextSort,
            priceOrder: nextPriceOrder
        }, () => {
            this.loadProducts(true);
        });
    },
    onCategorySelect(e) {
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
    onSearchConfirm(e) {
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
    onPullDownRefresh() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadProducts(true);
            wx.stopPullDownRefresh();
        });
    },
    onReachBottom() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.data.hasMore || this.data.loadingMore || this.data.initialLoading)
                return;
            this.setData({ loadingMore: true });
            this.setData({ page: this.data.page + 1 }, () => {
                this.loadProducts(false);
            });
        });
    }
});
