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
    CLOSING: '关单核实中', REFUND_PENDING: '退款待审核', PENDING_PAYMENT: '待付款', PAID: '待发货', SHIPPED: '运输中', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDING: '退款处理中', REFUNDED: '已退款'
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
    data: {
        order: null,
        loading: true,
        submitting: false,
        errorMessage: '',
        reviewVisible: false,
        reviewRating: 5,
        reviewComment: ''
    },
    onLoad(options) {
        const identifier = (options === null || options === void 0 ? void 0 : options.orderNo) || (options === null || options === void 0 ? void 0 : options.order_no) || (options === null || options === void 0 ? void 0 : options.outTradeNo) || (options === null || options === void 0 ? void 0 : options.out_trade_no) || (options === null || options === void 0 ? void 0 : options.order_id) || (options === null || options === void 0 ? void 0 : options.orderId) || (options === null || options === void 0 ? void 0 : options.id) || '';
        this.loadOrder(identifier, options);
    },
    loadOrder(idOrNo, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!idOrNo) {
                this.setData({ loading: false, errorMessage: '未指定订单查询编号' });
                return;
            }
            try {
                const order = yield order_service_1.OrderService.getDetail(idOrNo, options);
                if (!order)
                    throw new Error('订单不存在');
                const isExpress = true;
                const isPaid = !['PENDING_PAYMENT', 'CLOSING', 'CANCELLED'].includes(order.status);
                // 物流信息：优先取子订单 shipments[] 数组；兼容旧版单一 trackingNo 数据
                const rawShipments = (order.shipments && order.shipments.length > 0)
                    ? order.shipments
                    : (order.trackingNo
                        ? [{ trackingNo: order.trackingNo, logisticsCompany: order.logisticsCompany, expressCompany: order.expressCompany, shippedAt: order.shippedAt || order.shippingTime }]
                        : []);
                const shipments = rawShipments.map(s => (Object.assign(Object.assign({}, s), { shippedAtFormatted: formatDateTime(s.shippedAt) })));
                this.setData({
                    order: Object.assign(Object.assign({}, order), { statusLabel: STATUS_LABEL[order.status] || order.status, paymentStatusLabel: isPaid ? '已支付' : '待付款', isExpress, hasShipment: shipments.length > 0, shipments, payAmountYuan: (Number(order.payAmount || 0) / 100).toFixed(2), totalAmountYuan: (Number(order.totalAmount || order.payAmount || 0) / 100).toFixed(2), createdAtFormatted: formatDateTime(order.createdAt || order.createTime), paidAtFormatted: formatDateTime(order.paidAt || order.payTime), shippedAtFormatted: formatDateTime(order.shippedAt || order.shippingTime), items: (order.items || []).map(item => (Object.assign(Object.assign({}, item), { unitPriceYuan: (Number(item.unitPrice || 0) / 100).toFixed(2), totalAmountYuan: (Number(item.totalAmount || 0) / 100).toFixed(2) }))) }),
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
    onApplyRefund() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const id = ((_a = this.data.order) === null || _a === void 0 ? void 0 : _a._id) || ((_b = this.data.order) === null || _b === void 0 ? void 0 : _b.id);
            if (!id || this.data.submitting)
                return;
            const response = yield new Promise(resolve => wx.showModal({ title: '申请整单退款', content: '已发货订单需要退货并由管理员确认。请输入原因。', editable: true, placeholderText: '退款原因', success: resolve }));
            if (!response.confirm || !String(response.content || '').trim())
                return;
            this.setData({ submitting: true });
            try {
                yield order_service_1.OrderService.applyRefund(id, String(response.content).trim());
                wx.showToast({ title: '已提交退款申请', icon: 'success' });
                yield this.loadOrder(id);
            }
            catch (e) {
                wx.showToast({ title: e.message || '申请失败', icon: 'none' });
            }
            finally {
                this.setData({ submitting: false });
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
    },
    onOpenReview() {
        this.setData({ reviewVisible: true, reviewRating: 5, reviewComment: '' });
    },
    onCloseReview() {
        this.setData({ reviewVisible: false });
    },
    onSelectRating(e) {
        const rating = Number(e.currentTarget.dataset.rating);
        if (rating >= 1 && rating <= 5) {
            this.setData({ reviewRating: rating });
        }
    },
    onCommentInput(e) {
        this.setData({ reviewComment: e.detail.value });
    },
    onSubmitReview() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const id = ((_a = this.data.order) === null || _a === void 0 ? void 0 : _a._id) || ((_b = this.data.order) === null || _b === void 0 ? void 0 : _b.id) || ((_c = this.data.order) === null || _c === void 0 ? void 0 : _c.orderNo);
            if (!id || this.data.submitting)
                return;
            this.setData({ submitting: true });
            try {
                yield order_service_1.OrderService.submitReview(id, {
                    rating: this.data.reviewRating,
                    comment: this.data.reviewComment
                });
                wx.showToast({ title: '评价成功', icon: 'success' });
                this.setData({ reviewVisible: false });
                this.loadOrder(id);
            }
            catch (err) {
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '评价失败', icon: 'none' });
            }
            finally {
                this.setData({ submitting: false });
            }
        });
    }
});
