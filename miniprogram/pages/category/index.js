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
const IMAGE_ICON_REGEX = /^(https?:\/\/|cloud:\/\/|\/|data:image\/(?:png|jpeg|webp|svg\+xml)[;,])/i;
Page({
    data: {
        categories: [],
        activeCategoryIndex: 0,
        subCategories: [],
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
                this.setData({ categories: [], subCategories: [], errorMessage: err instanceof Error ? err.message : '云端分类加载失败，请重试' });
            }
        });
    },
    onRetry() { this.initCategories(); },
    /**
     * 点击一级分类：展开其二级网格（无二级则右侧显示空状态，不跳转）
     */
    onSelectCategory(e) {
        const index = Number(e.currentTarget.dataset.index);
        this.selectCategory(index);
    },
    selectCategory(index) {
        const cat = this.data.categories[index];
        if (!cat)
            return;
        const children = Array.isArray(cat.children) ? cat.children : [];
        this.setData({
            activeCategoryIndex: index,
            subCategories: this.formatSubCategories(children),
            scrollTop: 0
        });
    },
    formatSubCategories(children) {
        return children.map(item => {
            const iconStr = typeof item.icon === 'string' ? item.icon.trim() : '';
            const isImageIcon = IMAGE_ICON_REGEX.test(iconStr);
            return {
                id: item.id || item._id,
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
    onSelectSubCategory(e) {
        const index = Number(e.currentTarget.dataset.index);
        const sub = this.data.subCategories[index];
        if (!sub)
            return;
        const level1 = this.data.categories[this.data.activeCategoryIndex];
        const level1Name = level1 ? level1.name : '';
        const categoryName = level1Name ? `${level1Name} · ${sub.name}` : sub.name;
        wx.navigateTo({
            url: `/pages/goods/list/index?categoryId=${sub.id}&categoryName=${encodeURIComponent(categoryName)}`
        });
    },
    onSubIconError(e) {
        const index = Number(e.currentTarget.dataset.index);
        if (Number.isInteger(index) && this.data.subCategories[index]) {
            this.setData({
                [`subCategories[${index}].isImageIcon`]: false,
                [`subCategories[${index}].iconDisplay`]: '🛍️'
            });
        }
    }
});
