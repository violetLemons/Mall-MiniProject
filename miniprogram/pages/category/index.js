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
const category_service_1 = require("../../services/category.service");
const product_service_1 = require("../../services/product.service");
Page({
    data: {
        categories: [],
        activeCategoryIndex: 0,
        categoryProducts: [],
        loading: false,
        scrollTop: 0,
        errorMessage: ''
    },
    onLoad() {
        this.initCategories();
    },
    initCategories() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const categories = yield category_service_1.CategoryService.getQuickCategories();
                const list = Array.isArray(categories) ? categories : [];
                this.setData({ categories: list, errorMessage: '' });
                if (list.length > 0) {
                    this.loadCategoryProducts(list[0].id);
                }
            }
            catch (err) {
                console.error('Failed to load categories:', err);
                this.setData({ categories: [], categoryProducts: [], errorMessage: err instanceof Error ? err.message : '云端分类加载失败，请重试' });
            }
        });
    },
    onRetry() { this.initCategories(); },
    loadCategoryProducts(categoryId) {
        return __awaiter(this, void 0, void 0, function* () {
            this.setData({ loading: true });
            try {
                const res = yield product_service_1.ProductService.getList({
                    categoryId,
                    pageSize: 10
                });
                this.setData({
                    categoryProducts: res.list,
                    loading: false
                });
            }
            catch (err) {
                console.error(err);
                this.setData({ loading: false, errorMessage: err instanceof Error ? err.message : '商品加载失败，请重试' });
            }
        });
    },
    onSelectCategory(e) {
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
    onTapProduct(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/goods/detail/index?id=${id}`
        });
    }
});
