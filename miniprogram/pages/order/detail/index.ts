import { OrderModel, OrderService } from '../../../services/order.service';

const STATUS_LABEL: Record<string, string> = {
  CLOSING: '关单核实中', REFUND_PENDING: '退款待审核', PENDING_PAYMENT: '待付款', PAID: '待发货', SHIPPED: '运输中', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDING: '退款处理中', REFUNDED: '已退款'
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
  createdAtFormatted?: string;
  paidAtFormatted?: string;
  shippedAtFormatted?: string;
  isExpress?: boolean;
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

      const isExpress = true;
      const isPaid = !['PENDING_PAYMENT','CLOSING','CANCELLED'].includes(order.status);

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
          isExpress,
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

  async onApplyRefund() {
    const id=this.data.order?._id || this.data.order?.id;
    if(!id||this.data.submitting)return;
    const response=await new Promise<any>(resolve=>wx.showModal({title:'申请整单退款',content:'已发货订单需要退货并由管理员确认。请输入原因。',editable:true,placeholderText:'退款原因',success:resolve}));
    if(!response.confirm||!String(response.content||'').trim())return;
    this.setData({submitting:true});
    try{await OrderService.applyRefund(id,String(response.content).trim());wx.showToast({title:'已提交退款申请',icon:'success'});await this.loadOrder(id);}catch(e:any){wx.showToast({title:e.message||'申请失败',icon:'none'});}finally{this.setData({submitting:false});}
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
