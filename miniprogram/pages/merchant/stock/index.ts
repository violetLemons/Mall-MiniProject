import { MerchantService, MerchantInfo, MerchantProduct, MerchantInventoryLog } from '../../../services/merchant.service';

function fmtTime(ts: any): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const p = (n: number) => (n < 10 ? '0' + n : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

Page({
  data: {
    isLoggedIn: false,
    merchant: null as MerchantInfo | null,
    loading: true,
    overview: { totalProducts: 0, totalStock: 0, lowStock: 0 },
    logs: [] as any[],
    // 调账弹层
    showAdjust: false,
    adjustProducts: [] as any[],
    adjustProductIndex: 0,
    adjustSkus: [] as any[],
    adjustSkuIndex: 0,
    adjustTarget: '',
    adjustRemark: '',
    adjustLoading: false
  },

  onLoad() {
    this.init();
  },

  init() {
    const merchant = MerchantService.getMerchant();
    this.setData({ isLoggedIn: !!merchant, merchant });
    if (merchant) this.loadData();
    else this.setData({ loading: false });
  },

  onMerchantLogin() {
    const merchant = MerchantService.getMerchant();
    this.setData({ isLoggedIn: !!merchant, merchant });
    if (merchant) this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [productsRes, logsRes] = await Promise.all([
        MerchantService.getProducts({ page: 1, pageSize: 200 }).catch(() => ({ list: [], total: 0 })),
        MerchantService.getInventoryLogs({ page: 1, pageSize: 50 }).catch(() => ({ list: [], total: 0 }))
      ]);

      const products: MerchantProduct[] = productsRes.list || [];
      const totalStock = products.reduce((s, p) => s + (Number(p.totalStock) || 0), 0);
      const lowStock = products.filter(p => (Number(p.totalStock) || 0) < 10).length;

      const logs = (logsRes.list || []).map((l: MerchantInventoryLog) => ({
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
        adjustProducts: products.map((p: MerchantProduct) => ({ id: p._id || p.id, name: p.name })),
        loading: false
      });
    } catch (err: any) {
      this.setData({ loading: false });
      wx.showToast({ title: err?.message || '库存加载失败', icon: 'none' });
    }
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

  async onAdjustProductChange(e: any) {
    const idx = Number(e.detail.value) || 0;
    this.setData({ adjustProductIndex: idx, adjustSkus: [], adjustSkuIndex: 0 });
    const product = this.data.adjustProducts[idx];
    if (!product || !product.id) return;
    wx.showLoading({ title: '加载规格...' });
    try {
      const res = await MerchantService.getProduct(product.id);
      const skus = (res.skus || []).map((s: any) => ({
        id: s._id || s.skuId || s.id,
        label: `${s.colorName || '默认'} / ${s.size} (库存 ${s.stock})`,
        stock: Number(s.stock) || 0
      }));
      this.setData({ adjustSkus: skus });
      wx.hideLoading();
    } catch (e: any) {
      wx.hideLoading();
      wx.showToast({ title: e?.message || '规格加载失败', icon: 'none' });
    }
  },

  onAdjustSkuChange(e: any) {
    this.setData({ adjustSkuIndex: Number(e.detail.value) || 0 });
  },

  onAdjustInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`${field}`]: e.detail.value });
  },

  async onAdjustSubmit() {
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
      await MerchantService.adjustStock(sku.id, target, this.data.adjustRemark.trim() || '人工盘点');
      wx.showToast({ title: '库存已调整', icon: 'success' });
      this.setData({ showAdjust: false, adjustLoading: false });
      this.loadData();
    } catch (e: any) {
      this.setData({ adjustLoading: false });
      wx.showToast({ title: e?.message || '调账失败', icon: 'none' });
    }
  },

  async onPullDownRefresh() {
    await this.loadData();
    wx.stopPullDownRefresh();
  }
});
