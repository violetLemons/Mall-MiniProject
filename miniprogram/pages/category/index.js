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
        categories: [], // 一级分类（主要词条）
        activeCategoryIndex: 0,
        subCategories: [], // 当前一级下的二级分类（次要词条）
        activeSubIndex: -1,
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
                const tree = yield category_service_1.CategoryService.getCategoryTree();
                const list = Array.isArray(tree) ? tree : [];
                this.setData({ categories: list, errorMessage: '' });
                if (list.length > 0) {
                    this.selectCategory(0);
                }
            }
            catch (err) {
                console.error('Failed to load categories:', err);
                this.setData({ categories: [], categoryProducts: [], errorMessage: err instanceof Error ? err.message : '云端分类加载失败，请重试' });
            }
        });
    },
    onRetry() { this.initCategories(); },
    onSelectCategory(e) {
        const index = Number(e.currentTarget.dataset.index);
        this.selectCategory(index);
    },
    /**
     * 选中一级分类：展示其二级词条，并默认加载第一个二级分类（无二级则兜底加载该一级分类）
     */
    selectCategory(index) {
        const cat = this.data.categories[index];
        if (!cat)
            return;
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
        }
        else {
            this.loadCategoryProducts(cat.id);
        }
    },
    onSelectSubCategory(e) {
        const index = Number(e.currentTarget.dataset.index);
        this.selectSubCategory(index);
    },
    /**
     * 选中二级分类：加载该二级分类下的商品
     */
    selectSubCategory(index) {
        const sub = this.data.subCategories[index];
        if (!sub)
            return;
        this.setData({ activeSubIndex: index, scrollTop: 0 });
        this.loadCategoryProducts(sub.id);
    },
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
    onTapProduct(e) {
        const id = e.currentTarget.dataset.id;
        wx.navigateTo({
            url: `/pages/goods/detail/index?id=${id}`
        });
    }
});
