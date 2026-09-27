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
        stats: [
            { key: 'gmv', label: '总流水', value: '¥0.00' },
            { key: 'orders', label: '累计订单', value: '0' },
            { key: 'pendingShip', label: '待发货', value: '0' },
            { key: 'lowStock', label: '低库存', value: '0' }
        ],
        latestOrders: [],
        hotProducts: [],
        navItems: [
            { id: 'goods', title: '商品管理', desc: '上架/下架/新增商品', icon: '📦' },
            { id: 'stock', title: '库存流水', desc: '库存盘点与调账', icon: '📊' },
            { id: 'order', title: '订单管理', desc: '发货与退款审核', icon: '📋' },
            { id: 'setting', title: '商户设置', desc: '名称/地址/商户号', icon: '⚙️' }
        ]
    },
    onLoad() {
        this.init();
    },
    onShow() {
        // 从其它商户页返回时刷新数据（若有登录态）
        if (merchant_service_1.MerchantService.getMerchant())
            this.loadData();
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
                const [ordersRes, productsRes] = yield Promise.all([
                    merchant_service_1.MerchantService.getOrders({ page: 1, pageSize: 100 }).catch(() => ({ list: [], total: 0 })),
                    merchant_service_1.MerchantService.getProducts({ page: 1, pageSize: 100 }).catch(() => ({ list: [], total: 0 }))
                ]);
                const orders = ordersRes.list || [];
                const products = productsRes.list || [];
                const incomeStatuses = ['PAID', 'SHIPPED', 'COMPLETED', 'REFUND_PENDING', 'REFUNDING'];
                const gmvFen = orders.reduce((s, o) => s + (incomeStatuses.includes(o.status) ? (Number(o.payAmount) || 0) : 0), 0);
                const pendingShip = orders.filter(o => o.status === 'PAID').length;
                const lowStock = products.filter(p => (Number(p.totalStock) || 0) < 10).length;
                const latestOrders = orders.slice(0, 5).map(o => ({
                    id: o._id || o.id,
                    orderNo: o.orderNo,
                    status: o.status,
                    payAmountYuan: (0, merchant_service_1.formatYuan)(o.payAmount),
                    itemCount: (o.items || []).length
                }));
                const hotProducts = [...products]
                    .sort((a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0))
                    .slice(0, 4)
                    .map(p => ({
                    id: p._id || p.id,
                    name: p.name,
                    cover: p.cover || '',
                    sales: Number(p.sales) || 0,
                    minPriceYuan: (0, merchant_service_1.formatYuan)(p.minPrice)
                }));
                this.setData({
                    'stats[0].value': `¥${(0, merchant_service_1.formatYuan)(gmvFen)}`,
                    'stats[1].value': String(ordersRes.total || orders.length),
                    'stats[2].value': String(pendingShip),
                    'stats[3].value': String(lowStock),
                    latestOrders,
                    hotProducts,
                    loading: false
                });
            }
            catch (err) {
                this.setData({ loading: false });
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '数据加载失败', icon: 'none' });
            }
        });
    },
    onNavTap(e) {
        const id = e.currentTarget.dataset.id;
        const routes = {
            goods: '/pages/merchant/goods/index',
            stock: '/pages/merchant/stock/index',
            order: '/pages/merchant/order/index',
            setting: '/pages/merchant/setting/index'
        };
        if (routes[id])
            wx.navigateTo({ url: routes[id] });
    },
    onPullDownRefresh() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadData();
            wx.stopPullDownRefresh();
        });
    }
});
