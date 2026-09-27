import { MerchantService, MerchantInfo, MerchantOrder, formatYuan } from '../../../services/merchant.service';

const STATUS_LABEL: Record<string, string> = {
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
    merchant: null as MerchantInfo | null,
    loading: true,
    statusTab: 'ALL',
    statusTabs: [
      { key: 'ALL', label: '全部' },
      { key: 'PAID', label: '待发货' },
      { key: 'SHIPPED', label: '已发货' },
      { key: 'REFUND', label: '退款' }
    ],
    keyword: '',
    orders: [] as any[],
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
    const merchant = MerchantService.getMerchant();
    this.setData({ isLoggedIn: !!merchant, merchant });
    if (merchant) this.loadOrders(true);
    else this.setData({ loading: false });
  },

  onMerchantLogin() {
    const merchant = MerchantService.getMerchant();
    this.setData({ isLoggedIn: !!merchant, merchant });
    if (merchant) this.loadOrders(true);
  },

  async loadOrders(reset: boolean = false) {
    this.setData({ loading: true });
    try {
      const params: any = { page: 1, pageSize: 100 };
      if (this.data.statusTab === 'PAID') params.status = 'PAID';
      else if (this.data.statusTab === 'SHIPPED') params.status = 'SHIPPED';
      else if (this.data.statusTab === 'REFUND') params.statuses = ['REFUND_PENDING', 'REFUNDING'];
      if (this.data.keyword) params.orderNo = this.data.keyword;

      const res = await MerchantService.getOrders(params);
      const orders = (res.list || []).map((o: MerchantOrder) => ({
        id: o._id || o.id,
        orderNo: o.orderNo,
        status: o.status,
        statusLabel: STATUS_LABEL[o.status] || o.status,
        deliveryType: o.deliveryType,
        payAmountYuan: formatYuan(o.payAmount),
        items: (o.items || []).map((i: any) => ({
          skuId: i.skuId,
          productName: i.productName,
          spec: `${i.colorName || ''} ${i.size || ''}`.trim(),
          image: i.image,
          unitPriceYuan: formatYuan(i.unitPrice),
          count: i.count
        })),
        shipments: o.shipments || [],
        shippingAddress: o.shippingAddress,
        createdAt: o.createdAt
      }));
      this.setData({ orders, loading: false });
    } catch (err: any) {
      this.setData({ loading: false });
      wx.showToast({ title: err?.message || '订单加载失败', icon: 'none' });
    }
  },

  onStatusTab(e: any) {
    this.setData({ statusTab: e.currentTarget.dataset.key }, () => this.loadOrders(true));
  },

  onSearchInput(e: any) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.loadOrders(true);
  },

  onSearchClear() {
    this.setData({ keyword: '' }, () => this.loadOrders(true));
  },

  // ---------------- 发货 ----------------
  onOpenShip(e: any) {
    this.setData({ showShip: true, shipOrderId: e.currentTarget.dataset.id, shipTrackingNo: '', shipCompany: '' });
  },

  onCloseShip() {
    this.setData({ showShip: false });
  },

  onShipInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`${field}`]: e.detail.value });
  },

  async onShipSubmit() {
    const trackingNo = (this.data.shipTrackingNo || '').trim();
    if (trackingNo.length < 6) {
      wx.showToast({ title: '请输入有效物流单号', icon: 'none' });
      return;
    }
    try {
      await MerchantService.shipSubOrder(this.data.shipOrderId, trackingNo, this.data.shipCompany.trim() || '极速快递');
      wx.showToast({ title: '发货成功', icon: 'success' });
      this.setData({ showShip: false });
      this.loadOrders(true);
    } catch (e: any) {
      wx.showToast({ title: e?.message || '发货失败', icon: 'none' });
    }
  },

  // ---------------- 退款审核 ----------------
  onReviewRefund(e: any) {
    const id = e.currentTarget.dataset.id;
    const decision = e.currentTarget.dataset.decision;
    const isApprove = decision === 'APPROVE';
    wx.showModal({
      title: isApprove ? '同意退款' : '拒绝退款',
      content: isApprove ? '确认同意该订单退款？' : '确认拒绝该订单退款？',
      success: async (r: any) => {
        if (r.confirm) {
          try {
            await MerchantService.reviewRefund(id, decision);
            wx.showToast({ title: isApprove ? '已同意，等待平台执行' : '已拒绝', icon: 'none' });
            this.loadOrders(true);
          } catch (e: any) {
            wx.showToast({ title: e?.message || '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ---------------- 微信发货同步 ----------------
  onSyncWechat(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '同步中...' });
    MerchantService.syncWithWechat(id)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '同步完成', icon: 'success' });
        this.loadOrders(true);
      })
      .catch((err: any) => {
        wx.hideLoading();
        wx.showToast({ title: err?.message || '同步失败', icon: 'none' });
      });
  },

  async onPullDownRefresh() {
    await this.loadOrders(true);
    wx.stopPullDownRefresh();
  }
});
