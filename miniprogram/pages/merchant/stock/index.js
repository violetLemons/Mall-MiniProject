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
function fmtTime(ts) {
    if (!ts)
        return '';
    const d = new Date(ts);
    if (isNaN(d.getTime()))
        return String(ts);
    const p = (n) => (n < 10 ? '0' + n : String(n));
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
Page({
    data: {
        isLoggedIn: false,
        merchant: null,
        loading: true,
        overview: { totalProducts: 0, totalStock: 0, lowStock: 0 },
        logs: [],
        // 调账弹层
        showAdjust: false,
        adjustProducts: [],
        adjustProductIndex: 0,
        adjustSkus: [],
        adjustSkuIndex: 0,
        adjustTarget: '',
        adjustRemark: '',
        adjustLoading: false
    },
    onLoad() {
        this.init();
    },
    init() {
        const merchant = merchant_service_1.MerchantService.getMerchant();
        this.setData({ isLoggedIn: !!merchant, merchant });
        if (merchant)
            this.loadData();
        else
            this.setData({ loading: false });
    },
    onMerchantLogin() {
        const merchant = merchant_service_1.MerchantService.getMerchant();
        this.setData({ isLoggedIn: !!merchant, merchant });
        if (merchant)
            this.loadData();
    },
    loadData() {
        return __awaiter(this, void 0, void 0, function* () {
            this.setData({ loading: true });
            try {
                const [productsRes, logsRes] = yield Promise.all([
                    merchant_service_1.MerchantService.getProducts({ page: 1, pageSize: 200 }).catch(() => ({ list: [], total: 0 })),
                    merchant_service_1.MerchantService.getInventoryLogs({ page: 1, pageSize: 50 }).catch(() => ({ list: [], total: 0 }))
                ]);
                const products = productsRes.list || [];
                const totalStock = products.reduce((s, p) => s + (Number(p.totalStock) || 0), 0);
                const lowStock = products.filter(p => (Number(p.totalStock) || 0) < 10).length;
                const logs = (logsRes.list || []).map((l) => ({
                    id: l._id,
                    skuId: l.skuId || '',
                    delta: Number(l.delta) || 0,
                    deltaText: (Number(l.delta) || 0) > 0 ? `+${l.delta}` : String(l.delta || 0),
                    beforeStock: l.beforeStock,
                    afterStock: l.afterStock,
                    reason: l.reason,
                    remark: l.remark || '',
                    adminUsername: l.adminUsername || '',
                    createdAt: fmtTime(l.createdAt)
                }));
                this.setData({
                    overview: { totalProducts: products.length, totalStock, lowStock },
                    logs,
                    adjustProducts: products.map((p) => ({ id: p._id || p.id, name: p.name })),
                    loading: false
                });
            }
            catch (err) {
                this.setData({ loading: false });
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '库存加载失败', icon: 'none' });
            }
        });
    },
    onOpenAdjust() {
        this.setData({
            showAdjust: true,
            adjustProductIndex: 0,
            adjustSkus: [],
            adjustSkuIndex: 0,
            adjustTarget: '',
            adjustRemark: ''
        });
    },
    onCloseAdjust() {
        this.setData({ showAdjust: false });
    },
    onAdjustProductChange(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const idx = Number(e.detail.value) || 0;
            this.setData({ adjustProductIndex: idx, adjustSkus: [], adjustSkuIndex: 0 });
            const product = this.data.adjustProducts[idx];
            if (!product || !product.id)
                return;
            wx.showLoading({ title: '加载规格...' });
            try {
                const res = yield merchant_service_1.MerchantService.getProduct(product.id);
                const skus = (res.skus || []).map((s) => ({
                    id: s._id || s.skuId || s.id,
                    label: `${s.colorName || '默认'} / ${s.size} (库存 ${s.stock})`,
                    stock: Number(s.stock) || 0
                }));
                this.setData({ adjustSkus: skus });
                wx.hideLoading();
            }
            catch (e) {
                wx.hideLoading();
                wx.showToast({ title: (e === null || e === void 0 ? void 0 : e.message) || '规格加载失败', icon: 'none' });
            }
        });
    },
    onAdjustSkuChange(e) {
        this.setData({ adjustSkuIndex: Number(e.detail.value) || 0 });
    },
    onAdjustInput(e) {
        const field = e.currentTarget.dataset.field;
        this.setData({ [`${field}`]: e.detail.value });
    },
    onAdjustSubmit() {
        return __awaiter(this, void 0, void 0, function* () {
            const sku = this.data.adjustSkus[this.data.adjustSkuIndex];
            if (!sku || !sku.id) {
                wx.showToast({ title: '请选择商品规格', icon: 'none' });
                return;
            }
            const target = parseInt(this.data.adjustTarget, 10);
            if (isNaN(target) || target < 0) {
                wx.showToast({ title: '请输入有效目标库存', icon: 'none' });
                return;
            }
            this.setData({ adjustLoading: true });
            try {
                yield merchant_service_1.MerchantService.adjustStock(sku.id, target, this.data.adjustRemark.trim() || '人工盘点');
                wx.showToast({ title: '库存已调整', icon: 'success' });
                this.setData({ showAdjust: false, adjustLoading: false });
                this.loadData();
            }
            catch (e) {
                this.setData({ adjustLoading: false });
                wx.showToast({ title: (e === null || e === void 0 ? void 0 : e.message) || '调账失败', icon: 'none' });
            }
        });
    },
    onPullDownRefresh() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadData();
            wx.stopPullDownRefresh();
        });
    }
});
