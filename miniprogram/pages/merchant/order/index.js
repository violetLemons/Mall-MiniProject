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
const STATUS_LABEL = {
    PENDING_PAYMENT: '待付款',
    PAID: '待发货',
    SHIPPED: '已发货',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    REFUND_PENDING: '待审核退款',
    REFUNDING: '退款中',
    REFUNDED: '已退款'
};
Page({
    data: {
        isLoggedIn: false,
        merchant: null,
        loading: true,
        statusTab: 'ALL',
        statusTabs: [
            { key: 'ALL', label: '全部' },
            { key: 'PAID', label: '待发货' },
            { key: 'SHIPPED', label: '已发货' },
            { key: 'REFUND', label: '退款' }
        ],
        keyword: '',
        orders: [],
        // 发货弹层
        showShip: false,
        shipOrderId: '',
        shipTrackingNo: '',
        shipCompany: ''
    },
    onLoad() {
        this.init();
    },
    init() {
        const merchant = merchant_service_1.MerchantService.getMerchant();
        this.setData({ isLoggedIn: !!merchant, merchant });
        if (merchant)
            this.loadOrders(true);
        else
            this.setData({ loading: false });
    },
    onMerchantLogin() {
        const merchant = merchant_service_1.MerchantService.getMerchant();
        this.setData({ isLoggedIn: !!merchant, merchant });
        if (merchant)
            this.loadOrders(true);
    },
    loadOrders() {
        return __awaiter(this, arguments, void 0, function* (reset = false) {
            this.setData({ loading: true });
            try {
                const params = { page: 1, pageSize: 100 };
                if (this.data.statusTab === 'PAID')
                    params.status = 'PAID';
                else if (this.data.statusTab === 'SHIPPED')
                    params.status = 'SHIPPED';
                else if (this.data.statusTab === 'REFUND')
                    params.statuses = ['REFUND_PENDING', 'REFUNDING'];
                if (this.data.keyword)
                    params.orderNo = this.data.keyword;
                const res = yield merchant_service_1.MerchantService.getOrders(params);
                const orders = (res.list || []).map((o) => ({
                    id: o._id || o.id,
                    orderNo: o.orderNo,
                    status: o.status,
                    statusLabel: STATUS_LABEL[o.status] || o.status,
                    deliveryType: o.deliveryType,
                    payAmountYuan: (0, merchant_service_1.formatYuan)(o.payAmount),
                    items: (o.items || []).map((i) => ({
                        skuId: i.skuId,
                        productName: i.productName,
                        spec: `${i.colorName || ''} ${i.size || ''}`.trim(),
                        image: i.image,
                        unitPriceYuan: (0, merchant_service_1.formatYuan)(i.unitPrice),
                        count: i.count
                    })),
                    shipments: o.shipments || [],
                    shippingAddress: o.shippingAddress,
                    createdAt: o.createdAt
                }));
                this.setData({ orders, loading: false });
            }
            catch (err) {
                this.setData({ loading: false });
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '订单加载失败', icon: 'none' });
            }
        });
    },
    onStatusTab(e) {
        this.setData({ statusTab: e.currentTarget.dataset.key }, () => this.loadOrders(true));
    },
    onSearchInput(e) {
        this.setData({ keyword: e.detail.value });
    },
    onSearchConfirm() {
        this.loadOrders(true);
    },
    onSearchClear() {
        this.setData({ keyword: '' }, () => this.loadOrders(true));
    },
    // ---------------- 发货 ----------------
    onOpenShip(e) {
        this.setData({ showShip: true, shipOrderId: e.currentTarget.dataset.id, shipTrackingNo: '', shipCompany: '' });
    },
    onCloseShip() {
        this.setData({ showShip: false });
    },
    onShipInput(e) {
        const field = e.currentTarget.dataset.field;
        this.setData({ [`${field}`]: e.detail.value });
    },
    onShipSubmit() {
        return __awaiter(this, void 0, void 0, function* () {
            const trackingNo = (this.data.shipTrackingNo || '').trim();
            if (trackingNo.length < 6) {
                wx.showToast({ title: '请输入有效物流单号', icon: 'none' });
                return;
            }
            try {
                yield merchant_service_1.MerchantService.shipSubOrder(this.data.shipOrderId, trackingNo, this.data.shipCompany.trim() || '极速快递');
                wx.showToast({ title: '发货成功', icon: 'success' });
                this.setData({ showShip: false });
                this.loadOrders(true);
            }
            catch (e) {
                wx.showToast({ title: (e === null || e === void 0 ? void 0 : e.message) || '发货失败', icon: 'none' });
            }
        });
    },
    // ---------------- 退款审核 ----------------
    onReviewRefund(e) {
        const id = e.currentTarget.dataset.id;
        const decision = e.currentTarget.dataset.decision;
        const isApprove = decision === 'APPROVE';
        wx.showModal({
            title: isApprove ? '同意退款' : '拒绝退款',
            content: isApprove ? '确认同意该订单退款？' : '确认拒绝该订单退款？',
            success: (r) => __awaiter(this, void 0, void 0, function* () {
                if (r.confirm) {
                    try {
                        yield merchant_service_1.MerchantService.reviewRefund(id, decision);
                        wx.showToast({ title: isApprove ? '已同意，等待平台执行' : '已拒绝', icon: 'none' });
                        this.loadOrders(true);
                    }
                    catch (e) {
                        wx.showToast({ title: (e === null || e === void 0 ? void 0 : e.message) || '操作失败', icon: 'none' });
                    }
                }
            })
        });
    },
    // ---------------- 微信发货同步 ----------------
    onSyncWechat(e) {
        const id = e.currentTarget.dataset.id;
        wx.showLoading({ title: '同步中...' });
        merchant_service_1.MerchantService.syncWithWechat(id)
            .then(() => {
            wx.hideLoading();
            wx.showToast({ title: '同步完成', icon: 'success' });
            this.loadOrders(true);
        })
            .catch((err) => {
            wx.hideLoading();
            wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '同步失败', icon: 'none' });
        });
    },
    onPullDownRefresh() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadOrders(true);
            wx.stopPullDownRefresh();
        });
    }
});
