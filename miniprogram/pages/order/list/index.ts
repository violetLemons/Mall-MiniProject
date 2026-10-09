import { OrderModel, OrderService } from '../../../services/order.service';

const TABS = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING_PAYMENT', label: '待付款' },
  { key: 'PAID', label: '待发货' },
  { key: 'SHIPPED', label: '待收货' },
  { key: 'REFUND', label: '退款中' },
  { key: 'PENDING_REVIEW', label: '待评价' },
  { key: 'COMPLETED', label: '已完成' }
];
const STATUS_LABEL: Record<string, string> = {
  CLOSING: '关单核实中', REFUND_PENDING: '退款待审核', PENDING_PAYMENT: '待付款', PAID: '待发货', SHIPPED: '运输中', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDING: '退款处理中', REFUNDED: '已退款'
};

Page({
  data: { tabs: TABS, activeTab: 'ALL', orders: [] as OrderModel[], loading: false, page: 0, hasMore: true },

  onLoad(options: any) {
    const tab = options.status && TABS.some(item => item.key === options.status) ? options.status : 'ALL';
    this.setData({ activeTab: tab });
  },

  onShow() { this.loadOrders(); },

  onReachBottom() { if (!this.data.loading && this.data.hasMore) this.loadOrders(true); },

  async loadOrders(append = false) {
    if (this.data.loading) return;
    const page = append ? this.data.page + 1 : 1;
    const activeTab = this.data.activeTab;
    this.setData({ loading: true });
    try {
      const result = await OrderService.getList({ page, pageSize: 50, status: activeTab === 'ALL' ? undefined : activeTab });
      if (activeTab !== this.data.activeTab) return;
      const orders = (result.list || []).map(order => {
        let statusLabel = STATUS_LABEL[order.status] || order.status;
        // 已完成但未评价 → 显示「待评价」，与「待评价」tab 语义一致
        if (order.status === 'COMPLETED' && order.reviewed !== true) {
          statusLabel = '待评价';
        }
        return {
          ...order,
          statusLabel,
          payAmountYuan: (Number(order.payAmount || 0) / 100).toFixed(2),
          items: (order.items || []).map(item => ({
            ...item,
            unitPriceYuan: (Number(item.unitPrice || 0) / 100).toFixed(2)
          }))
        };
      });
      const merged = append ? [...this.data.orders, ...orders] : orders;
      this.setData({ orders: merged, page, hasMore: merged.length < result.total });
    } catch (err: any) {
      wx.showToast({ title: err?.message || '订单加载失败', icon: 'none' });
      if (!append) this.setData({ orders: [] });
    } finally { this.setData({ loading: false }); if (activeTab !== this.data.activeTab) this.loadOrders(); }
  },

  onTabChange(e: any) { this.setData({ activeTab: e.currentTarget.dataset.key }, () => this.loadOrders()); },
  onOpenDetail(e: any) { wx.navigateTo({ url: `/pages/order/detail/index?id=${e.currentTarget.dataset.id}` }); },

  async onCancel(e: any) {
    const id = e.currentTarget.dataset.id;
    const order=this.data.orders.find(o=>(o._id || o.id)===id);
    const response=await new Promise<any>(resolve=>wx.showModal({title:'取消付款',content:order?.groupId ? '将取消本次付款对应的全部待付款订单。' : '确认取消此订单？',success:resolve}));
    if(!response.confirm)return;
    try { await OrderService.cancelOrder(id); wx.showToast({ title: '订单已取消', icon: 'success' }); this.loadOrders(); }
    catch (err: any) { wx.showToast({ title: err?.message || '取消失败', icon: 'none' }); }
  },

  async onPay(e: any) {
    try {
      const result = await OrderService.payOrder(e.currentTarget.dataset.id);
      wx.showToast({ title: result.message || '支付处理中', icon: result.status === 'PAID' ? 'success' : 'none' });
      this.loadOrders();
    } catch (err: any) { wx.showToast({ title: err?.message || '支付失败', icon: 'none' }); }
  }
});
