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
const order_service_1 = require("../../../services/order.service");
const STATUS_LABEL = {
    PENDING_PAYMENT: '待付款', PAID: '待发货', SHIPPED: '运输中', WAITING_PICKUP: '待发货',
    READY_FOR_PICKUP: '待收货', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDING: '退款处理中', REFUNDED: '已退款'
};
const PICKUP_STATUS_LABEL = {
    PREPARING: '门店备货中',
    READY: '待自提（可到店提货）',
    PICKED: '已自提交付',
    COMPLETED: '已自提完成'
};
function formatDateTime(val) {
    if (!val)
        return '';
    const d = new Date(val);
    if (isNaN(d.getTime()))
        return String(val);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}
Page({
    data: { order: null, loading: true, submitting: false, errorMessage: '' },
    onLoad(options) {
        const identifier = (options === null || options === void 0 ? void 0 : options.orderNo) || (options === null || options === void 0 ? void 0 : options.order_no) || (options === null || options === void 0 ? void 0 : options.outTradeNo) || (options === null || options === void 0 ? void 0 : options.out_trade_no) || (options === null || options === void 0 ? void 0 : options.order_id) || (options === null || options === void 0 ? void 0 : options.orderId) || (options === null || options === void 0 ? void 0 : options.id) || '';
        this.loadOrder(identifier, options);
    },
    loadOrder(idOrNo, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!idOrNo) {
                this.setData({ loading: false, errorMessage: '未指定订单查询编号' });
                return;
            }
            try {
                const order = yield order_service_1.OrderService.getDetail(idOrNo, options);
                if (!order)
                    throw new Error('订单不存在');
                const isExpress = order.deliveryType === 'DELIVERY' || order.deliveryType === 'express';
                const isPickup = order.deliveryType === 'PICKUP' || order.deliveryType === 'pickup';
                const isPaid = order.status !== 'PENDING_PAYMENT' && order.status !== 'CANCELLED';
                const rawPickupStatus = ((_a = order.pickupInfo) === null || _a === void 0 ? void 0 : _a.pickupStatus) || order.pickupStatus || '';
                let pickupStatusLabel = PICKUP_STATUS_LABEL[rawPickupStatus];
                if (!pickupStatusLabel) {
                    if (order.status === 'COMPLETED')
                        pickupStatusLabel = '已自提交付';
                    else if (order.status === 'READY_FOR_PICKUP')
                        pickupStatusLabel = '待自提（可到店提货）';
                    else
                        pickupStatusLabel = '门店备货中';
                }
                this.setData({
                    order: Object.assign(Object.assign({}, order), { statusLabel: STATUS_LABEL[order.status] || order.status, paymentStatusLabel: isPaid ? '已支付' : '待付款', pickupStatusLabel,
                        isExpress,
                        isPickup, payAmountYuan: (Number(order.payAmount || 0) / 100).toFixed(2), totalAmountYuan: (Number(order.totalAmount || order.payAmount || 0) / 100).toFixed(2), createdAtFormatted: formatDateTime(order.createdAt || order.createTime), paidAtFormatted: formatDateTime(order.paidAt || order.payTime), shippedAtFormatted: formatDateTime(order.shippedAt || order.shippingTime), items: (order.items || []).map(item => (Object.assign(Object.assign({}, item), { unitPriceYuan: (Number(item.unitPrice || 0) / 100).toFixed(2), totalAmountYuan: (Number(item.totalAmount || 0) / 100).toFixed(2) }))) }),
                    loading: false,
                    errorMessage: ''
                });
            }
            catch (err) {
                this.setData({ loading: false, errorMessage: (err === null || err === void 0 ? void 0 : err.message) || '订单加载失败，请核对订单号后重试' });
            }
        });
    },
    onCopyOrderNo() {
        var _a;
        if (!((_a = this.data.order) === null || _a === void 0 ? void 0 : _a.orderNo))
            return;
        wx.setClipboardData({
            data: this.data.order.orderNo,
            success: () => wx.showToast({ title: '单号已复制', icon: 'none' })
        });
    },
    onPay() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.data.order || this.data.submitting)
                return;
            this.setData({ submitting: true });
            try {
                const result = yield order_service_1.OrderService.payOrder(this.data.order._id || this.data.order.id || this.data.order.orderNo);
                wx.showToast({ title: result.message, icon: result.status === 'PAID' ? 'success' : 'none' });
                this.loadOrder(this.data.order._id || this.data.order.id || this.data.order.orderNo);
            }
            catch (err) {
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '支付失败', icon: 'none' });
            }
            finally {
                this.setData({ submitting: false });
            }
        });
    },
    onCancel() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const id = ((_a = this.data.order) === null || _a === void 0 ? void 0 : _a._id) || ((_b = this.data.order) === null || _b === void 0 ? void 0 : _b.id) || ((_c = this.data.order) === null || _c === void 0 ? void 0 : _c.orderNo);
            if (!id)
                return;
            try {
                yield order_service_1.OrderService.cancelOrder(id);
                wx.showToast({ title: '订单已取消', icon: 'success' });
                this.loadOrder(id);
            }
            catch (err) {
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '取消失败', icon: 'none' });
            }
        });
    },
    onConfirmReceive() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const id = ((_a = this.data.order) === null || _a === void 0 ? void 0 : _a._id) || ((_b = this.data.order) === null || _b === void 0 ? void 0 : _b.id) || ((_c = this.data.order) === null || _c === void 0 ? void 0 : _c.orderNo);
            if (!id)
                return;
            try {
                yield order_service_1.OrderService.confirmReceive(id);
                wx.showToast({ title: '已确认收货', icon: 'success' });
                this.loadOrder(id);
            }
            catch (err) {
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '操作失败', icon: 'none' });
            }
        });
    }
});
