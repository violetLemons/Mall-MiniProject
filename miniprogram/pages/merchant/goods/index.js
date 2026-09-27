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
const merchant_service_1 = require("../../../services/merchant.service");
Page({
    data: {
        isLoggedIn: false,
        merchant: null,
        loading: true,
        statusTab: 'ALL',
        statusTabs: [
            { key: 'ALL', label: '全部' },
            { key: 'ON_SALE', label: '在售' },
            { key: 'OFF_SALE', label: '下架' }
        ],
        keyword: '',
        products: [],
        categories: [],
        // 表单
        showForm: false,
        formMode: 'create',
        formId: '',
        form: {
            name: '',
            cover: '',
            categoryIndex: 0,
            price: '',
            stock: '',
            tags: [],
            deliveryTypes: ['DELIVERY']
        },
        tagInput: '',
        saving: false
    },
    onLoad() {
        this.init();
    },
    init() {
        const merchant = merchant_service_1.MerchantService.getMerchant();
        this.setData({ isLoggedIn: !!merchant, merchant });
        if (merchant) {
            this.loadCategories();
            this.loadProducts(true);
        }
        else {
            this.setData({ loading: false });
        }
    },
    onMerchantLogin() {
        const merchant = merchant_service_1.MerchantService.getMerchant();
        this.setData({ isLoggedIn: !!merchant, merchant });
        if (merchant) {
            this.loadCategories();
            this.loadProducts(true);
        }
    },
    loadCategories() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const cats = yield merchant_service_1.MerchantService.getCategories();
                const list = [{ id: '', name: '未分类' }].concat((Array.isArray(cats) ? cats : []).map((c) => ({ id: c.id || c._id, name: c.name })));
                this.setData({ categories: list });
            }
            catch (err) {
                console.warn('[goods] load categories failed', err);
                this.setData({ categories: [{ id: '', name: '未分类' }] });
            }
        });
    },
    loadProducts() {
        return __awaiter(this, arguments, void 0, function* (reset = false) {
            this.setData({ loading: true });
            try {
                const params = { page: 1, pageSize: 100 };
                if (this.data.statusTab !== 'ALL')
                    params.status = this.data.statusTab;
                if (this.data.keyword)
                    params.keyword = this.data.keyword;
                const res = yield merchant_service_1.MerchantService.getProducts(params);
                const products = (res.list || []).map((p) => ({
                    id: p._id || p.id,
                    name: p.name,
                    cover: p.cover || '',
                    minPriceYuan: (0, merchant_service_1.formatYuan)(p.minPrice),
                    totalStock: Number(p.totalStock) || 0,
                    sales: Number(p.sales) || 0,
                    status: p.status
                }));
                this.setData({ products, loading: false });
            }
            catch (err) {
                this.setData({ loading: false });
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '商品加载失败', icon: 'none' });
            }
        });
    },
    onStatusTab(e) {
        const key = e.currentTarget.dataset.key;
        this.setData({ statusTab: key }, () => this.loadProducts(true));
    },
    onSearchInput(e) {
        this.setData({ keyword: e.detail.value });
    },
    onSearchConfirm() {
        this.loadProducts(true);
    },
    onSearchClear() {
        this.setData({ keyword: '' }, () => this.loadProducts(true));
    },
    // ---------------- 表单 ----------------
    onOpenCreate() {
        this.setData({
            showForm: true,
            formMode: 'create',
            formId: '',
            form: { name: '', cover: '', categoryIndex: 0, price: '', stock: '', tags: [], deliveryTypes: ['DELIVERY'] },
            tagInput: ''
        });
    },
    onOpenEdit(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = e.currentTarget.dataset.id;
            wx.showLoading({ title: '加载中...' });
            try {
                const res = yield merchant_service_1.MerchantService.getProduct(id);
                const p = res.product || {};
                const catIndex = Math.max(0, this.data.categories.findIndex((c) => c.id === p.categoryId));
                this.setData({
                    showForm: true,
                    formMode: 'edit',
                    formId: id,
                    form: {
                        name: p.name || '',
                        cover: p.cover || '',
                        categoryIndex: catIndex,
                        price: p.minPrice ? (Number(p.minPrice) / 100).toFixed(2) : '',
                        stock: p.totalStock != null ? String(p.totalStock) : '',
                        tags: Array.isArray(p.tags) ? p.tags : [],
                        deliveryTypes: Array.isArray(p.deliveryTypes) && p.deliveryTypes.length ? p.deliveryTypes : ['DELIVERY']
                    },
                    tagInput: ''
                });
                wx.hideLoading();
            }
            catch (err) {
                wx.hideLoading();
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '加载失败', icon: 'none' });
            }
        });
    },
    onCloseForm() {
        this.setData({ showForm: false });
    },
    onFormInput(e) {
        const field = e.currentTarget.dataset.field;
        this.setData({ [`form.${field}`]: e.detail.value });
    },
    onCategoryChange(e) {
        this.setData({ 'form.categoryIndex': Number(e.detail.value) || 0 });
    },
    onTagInput(e) {
        this.setData({ tagInput: e.detail.value });
    },
    onAddTag() {
        const tag = (this.data.tagInput || '').trim();
        if (!tag)
            return;
        if (this.data.form.tags.includes(tag)) {
            wx.showToast({ title: '标签已存在', icon: 'none' });
            return;
        }
        this.setData({ 'form.tags': [...this.data.form.tags, tag], tagInput: '' });
    },
    onRemoveTag(e) {
        const tag = e.currentTarget.dataset.tag;
        this.setData({ 'form.tags': this.data.form.tags.filter((t) => t !== tag) });
    },
    onDeliveryToggle(e) {
        const type = e.currentTarget.dataset.type;
        const cur = this.data.form.deliveryTypes;
        const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
        if (next.length === 0) {
            wx.showToast({ title: '至少保留一种配送方式', icon: 'none' });
            return;
        }
        this.setData({ 'form.deliveryTypes': next });
    },
    onChooseCover() {
        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            success: (res) => {
                const file = res.tempFiles && res.tempFiles[0];
                if (!file || !file.tempFilePath)
                    return;
                const tempPath = file.tempFilePath;
                const ext = (tempPath.split('.').pop() || 'jpg').toLowerCase();
                wx.getFileSystemManager().readFile({
                    filePath: tempPath,
                    encoding: 'base64',
                    success: (readRes) => __awaiter(this, void 0, void 0, function* () {
                        const base64 = `data:image/${ext};base64,${readRes.data}`;
                        wx.showLoading({ title: '上传中...' });
                        try {
                            const up = yield merchant_service_1.MerchantService.uploadImage(base64, `cover_${Date.now()}.${ext}`);
                            this.setData({ 'form.cover': up.url || base64 });
                            wx.hideLoading();
                            wx.showToast({ title: '封面已上传', icon: 'success' });
                        }
                        catch (e) {
                            wx.hideLoading();
                            wx.showToast({ title: (e === null || e === void 0 ? void 0 : e.message) || '上传失败', icon: 'none' });
                        }
                    })
                });
            }
        });
    },
    onSave() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const f = this.data.form;
            const name = (f.name || '').trim();
            if (!name) {
                wx.showToast({ title: '请填写商品名称', icon: 'none' });
                return;
            }
            if (!f.cover) {
                wx.showToast({ title: '请上传商品封面', icon: 'none' });
                return;
            }
            const priceFen = Math.round(parseFloat(f.price || '0') * 100);
            if (!priceFen || priceFen <= 0) {
                wx.showToast({ title: '请填写有效价格', icon: 'none' });
                return;
            }
            const stock = parseInt(f.stock || '0', 10);
            if (isNaN(stock) || stock < 0) {
                wx.showToast({ title: '请填写有效库存', icon: 'none' });
                return;
            }
            const categoryId = ((_a = this.data.categories[this.data.form.categoryIndex]) === null || _a === void 0 ? void 0 : _a.id) || '';
            const payload = {
                name,
                cover: f.cover,
                categoryId,
                minPrice: priceFen,
                totalStock: stock,
                tags: f.tags,
                deliveryTypes: f.deliveryTypes
            };
            this.setData({ saving: true });
            try {
                if (this.data.formMode === 'edit') {
                    yield merchant_service_1.MerchantService.updateProduct(Object.assign({ id: this.data.formId }, payload));
                    wx.showToast({ title: '已提交审核，等待平台通过', icon: 'none' });
                }
                else {
                    yield merchant_service_1.MerchantService.createProduct(payload);
                    wx.showToast({ title: '已提交审核，等待平台通过', icon: 'none' });
                }
                this.setData({ showForm: false, saving: false });
                this.loadProducts(true);
            }
            catch (err) {
                this.setData({ saving: false });
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '保存失败', icon: 'none' });
            }
        });
    },
    onToggleStatus(e) {
        const id = e.currentTarget.dataset.id;
        const status = e.currentTarget.dataset.status;
        const next = status === 'ON_SALE' ? 'OFF_SALE' : 'ON_SALE';
        wx.showModal({
            title: '提示',
            content: next === 'ON_SALE' ? '确认上架该商品？' : '确认下架该商品？',
            success: (r) => __awaiter(this, void 0, void 0, function* () {
                if (r.confirm) {
                    try {
                        yield merchant_service_1.MerchantService.updateProductStatus(id, next);
                        wx.showToast({ title: next === 'ON_SALE' ? '已上架' : '已下架', icon: 'success' });
                        this.loadProducts(true);
                    }
                    catch (e) {
                        wx.showToast({ title: (e === null || e === void 0 ? void 0 : e.message) || '操作失败', icon: 'none' });
                    }
                }
            })
        });
    },
    onDelete(e) {
        const id = e.currentTarget.dataset.id;
        wx.showModal({
            title: '删除商品',
            content: '删除后商品将下架，历史订单保留。此操作不可撤销。',
            confirmColor: '#FF5500',
            success: (r) => __awaiter(this, void 0, void 0, function* () {
                if (r.confirm) {
                    try {
                        yield merchant_service_1.MerchantService.deleteProduct(id);
                        wx.showToast({ title: '已删除', icon: 'none' });
                        this.loadProducts(true);
                    }
                    catch (e) {
                        wx.showToast({ title: (e === null || e === void 0 ? void 0 : e.message) || '删除失败', icon: 'none' });
                    }
                }
            })
        });
    },
    onPullDownRefresh() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadProducts(true);
            wx.stopPullDownRefresh();
        });
    }
});
