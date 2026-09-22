import { OrderModel, OrderService } from '../../../services/order.service';

const TABS = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING_PAYMENT', label: '待付款' },
  { key: 'PAID', label: '待发货' },
  { key: 'SHIPPED', label: '待收货' }
];
const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: '待付款', PAID: '待发货', SHIPPED: '运输中', WAITING_PICKUP: '待发货',
  READY_FOR_PICKUP: '待收货', COMPLETED: '已完成', CANCELLED: '已取消', REFUNDING: '退款处理中', REFUNDED: '已退款'
};

Page({
  data: { tabs: TABS, activeTab: 'ALL', orders: [] as OrderModel[], loading: false },

  onLoad(options: any) {
    const tab = options.status && TABS.some(item => item.key === options.status) ? options.status : 'ALL';
    this.setData({ activeTab: tab });
  },

  onShow() { this.loadOrders(); },

  async loadOrders() {
    this.setData({ loading: true });
    try {
      const result = await OrderService.getList({ page: 1, pageSize: 50, status: this.data.activeTab === 'ALL' ? undefined : this.data.activeTab });
      const orders = (result.list || []).map(order => ({
        ...order,
        statusLabel: STATUS_LABEL[order.status] || order.status,
        payAmountYuan: (Number(order.payAmount || 0) / 100).toFixed(2),
        items: (order.items || []).map(item => ({
          ...item,
          unitPriceYuan: (Number(item.unitPrice || 0) / 100).toFixed(2)
        }))
      }));
      this.setData({ orders });
    } catch (err: any) {
      wx.showToast({ title: err?.message || '订单加载失败', icon: 'none' });
      this.setData({ orders: [] });
    } finally { this.setData({ loading: false }); }
  },

  onTabChange(e: any) { this.setData({ activeTab: e.currentTarget.dataset.key }, () => this.loadOrders()); },
  onOpenDetail(e: any) { wx.navigateTo({ url: `/pages/order/detail/index?id=${e.currentTarget.dataset.id}` }); },

  async onCancel(e: any) {
    const id = e.currentTarget.dataset.id;
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
