import { OrderModel, OrderService } from '../../../services/order.service';

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: '待付款', PAID: '待发货', SHIPPED: '运输中', WAITING_PICKUP: '待发货',
  READY_FOR_PICKUP: '待收货', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDING: '退款处理中', REFUNDED: '已退款'
};

const PICKUP_STATUS_LABEL: Record<string, string> = {
  PREPARING: '门店备货中',
  READY: '待自提（可到店提货）',
  PICKED: '已自提交付',
  COMPLETED: '已自提完成'
};

function formatDateTime(val: any): string {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

type OrderViewModel = OrderModel & {
  payAmountYuan?: string;
  totalAmountYuan?: string;
  statusLabel?: string;
  paymentStatusLabel?: string;
  pickupStatusLabel?: string;
  createdAtFormatted?: string;
  paidAtFormatted?: string;
  shippedAtFormatted?: string;
  isExpress?: boolean;
  isPickup?: boolean;
  hasShipment?: boolean;
  shipments: { trackingNo?: string; logisticsCompany?: string; expressCompany?: string; shippedAt?: string; shippedAtFormatted?: string }[];
  items: (OrderModel['items'][number] & { totalAmountYuan?: string; unitPriceYuan?: string })[];
};

Page({
  data: {
    order: null as OrderViewModel | null,
    loading: true,
    submitting: false,
    errorMessage: '',
    reviewVisible: false,
    reviewRating: 5,
    reviewComment: ''
  },

  onLoad(options: any) {
    const identifier = options?.orderNo || options?.order_no || options?.outTradeNo || options?.out_trade_no || options?.order_id || options?.orderId || options?.id || '';
    this.loadOrder(identifier, options);
  },

  async loadOrder(idOrNo: string, options?: any) {
    if (!idOrNo) { this.setData({ loading: false, errorMessage: '未指定订单查询编号' }); return; }
    try {
      const order = await OrderService.getDetail(idOrNo, options);
      if (!order) throw new Error('订单不存在');

      const isExpress = order.deliveryType === 'DELIVERY' || (order.deliveryType as string) === 'express';
      const isPickup = order.deliveryType === 'PICKUP' || (order.deliveryType as string) === 'pickup';
      const isPaid = order.status !== 'PENDING_PAYMENT' && order.status !== 'CANCELLED';

      const rawPickupStatus = order.pickupInfo?.pickupStatus || (order as any).pickupStatus || '';
      let pickupStatusLabel = PICKUP_STATUS_LABEL[rawPickupStatus];
      if (!pickupStatusLabel) {
        if (order.status === 'COMPLETED') pickupStatusLabel = '已自提交付';
        else if (order.status === 'READY_FOR_PICKUP') pickupStatusLabel = '待自提（可到店提货）';
        else pickupStatusLabel = '门店备货中';
      }

      // 物流信息：优先取子订单 shipments[] 数组；兼容旧版单一 trackingNo 数据
      const rawShipments = (order.shipments && order.shipments.length > 0)
        ? order.shipments
        : (order.trackingNo
          ? [{ trackingNo: order.trackingNo, logisticsCompany: (order as any).logisticsCompany, expressCompany: (order as any).expressCompany, shippedAt: (order as any).shippedAt || (order as any).shippingTime }]
          : []);
      const shipments = rawShipments.map(s => ({
        ...s,
        shippedAtFormatted: formatDateTime(s.shippedAt)
      }));

      this.setData({
        order: {
          ...order,
          statusLabel: STATUS_LABEL[order.status] || order.status,
          paymentStatusLabel: isPaid ? '已支付' : '待付款',
          pickupStatusLabel,
          isExpress,
          isPickup,
          hasShipment: shipments.length > 0,
          shipments,
          payAmountYuan: (Number(order.payAmount || 0) / 100).toFixed(2),
          totalAmountYuan: (Number(order.totalAmount || order.payAmount || 0) / 100).toFixed(2),
          createdAtFormatted: formatDateTime(order.createdAt || (order as any).createTime),
          paidAtFormatted: formatDateTime((order as any).paidAt || (order as any).payTime),
          shippedAtFormatted: formatDateTime((order as any).shippedAt || (order as any).shippingTime),
          items: (order.items || []).map(item => ({
            ...item,
            unitPriceYuan: (Number(item.unitPrice || 0) / 100).toFixed(2),
            totalAmountYuan: (Number(item.totalAmount || 0) / 100).toFixed(2)
          }))
        },
        loading: false,
        errorMessage: ''
      });
    } catch (err: any) {
      this.setData({ loading: false, errorMessage: err?.message || '订单加载失败，请核对订单号后重试' });
    }
  },

  onCopyOrderNo() {
    if (!this.data.order?.orderNo) return;
    wx.setClipboardData({
      data: this.data.order.orderNo,
      success: () => wx.showToast({ title: '单号已复制', icon: 'none' })
    });
  },

  async onPay() {
    if (!this.data.order || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const result = await OrderService.payOrder(this.data.order._id || this.data.order.id || this.data.order.orderNo);
      wx.showToast({ title: result.message, icon: result.status === 'PAID' ? 'success' : 'none' });
      this.loadOrder(this.data.order._id || this.data.order.id || this.data.order.orderNo);
    } catch (err: any) {
      wx.showToast({ title: err?.message || '支付失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async onCancel() {
    const id = this.data.order?._id || this.data.order?.id || this.data.order?.orderNo;
    if (!id) return;
    try {
      await OrderService.cancelOrder(id);
      wx.showToast({ title: '订单已取消', icon: 'success' });
      this.loadOrder(id);
    } catch (err: any) {
      wx.showToast({ title: err?.message || '取消失败', icon: 'none' });
    }
  },

  async onConfirmReceive() {
    const id = this.data.order?._id || this.data.order?.id || this.data.order?.orderNo;
    if (!id) return;
    try {
      await OrderService.confirmReceive(id);
      wx.showToast({ title: '已确认收货', icon: 'success' });
      this.loadOrder(id);
    } catch (err: any) {
      wx.showToast({ title: err?.message || '操作失败', icon: 'none' });
    }
  },

  onOpenReview() {
    this.setData({ reviewVisible: true, reviewRating: 5, reviewComment: '' });
  },

  onCloseReview() {
    this.setData({ reviewVisible: false });
  },

  onSelectRating(e: any) {
    const rating = Number(e.currentTarget.dataset.rating);
    if (rating >= 1 && rating <= 5) {
      this.setData({ reviewRating: rating });
    }
  },

  onCommentInput(e: any) {
    this.setData({ reviewComment: e.detail.value });
  },

  async onSubmitReview() {
    const id = this.data.order?._id || this.data.order?.id || this.data.order?.orderNo;
    if (!id || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await OrderService.submitReview(id, {
        rating: this.data.reviewRating,
        comment: this.data.reviewComment
      });
      wx.showToast({ title: '评价成功', icon: 'success' });
      this.setData({ reviewVisible: false });
      this.loadOrder(id);
    } catch (err: any) {
      wx.showToast({ title: err?.message || '评价失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
