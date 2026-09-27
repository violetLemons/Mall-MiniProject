import { MerchantService, MerchantInfo, MerchantProduct, formatYuan } from '../../../services/merchant.service';

Page({
  data: {
    isLoggedIn: false,
    merchant: null as MerchantInfo | null,
    loading: true,
    statusTab: 'ALL',
    statusTabs: [
      { key: 'ALL', label: '全部' },
      { key: 'ON_SALE', label: '在售' },
      { key: 'OFF_SALE', label: '下架' }
    ],
    keyword: '',
    products: [] as any[],
    categories: [] as { id: string; name: string }[],
    // 表单
    showForm: false,
    formMode: 'create' as 'create' | 'edit',
    formId: '',
    form: {
      name: '',
      cover: '',
      categoryIndex: 0,
      price: '',
      stock: '',
      tags: [] as string[],
      deliveryTypes: ['DELIVERY'] as string[]
    },
    tagInput: '',
    saving: false
  },

  onLoad() {
    this.init();
  },

  init() {
    const merchant = MerchantService.getMerchant();
    this.setData({ isLoggedIn: !!merchant, merchant });
    if (merchant) {
      this.loadCategories();
      this.loadProducts(true);
    } else {
      this.setData({ loading: false });
    }
  },

  onMerchantLogin() {
    const merchant = MerchantService.getMerchant();
    this.setData({ isLoggedIn: !!merchant, merchant });
    if (merchant) {
      this.loadCategories();
      this.loadProducts(true);
    }
  },

  async loadCategories() {
    try {
      const cats = await MerchantService.getCategories();
      const list = [{ id: '', name: '未分类' }].concat(
        (Array.isArray(cats) ? cats : []).map((c: any) => ({ id: c.id || c._id, name: c.name }))
      );
      this.setData({ categories: list });
    } catch (err) {
      console.warn('[goods] load categories failed', err);
      this.setData({ categories: [{ id: '', name: '未分类' }] });
    }
  },

  async loadProducts(reset: boolean = false) {
    this.setData({ loading: true });
    try {
      const params: any = { page: 1, pageSize: 100 };
      if (this.data.statusTab !== 'ALL') params.status = this.data.statusTab;
      if (this.data.keyword) params.keyword = this.data.keyword;

      const res = await MerchantService.getProducts(params);
      const products = (res.list || []).map((p: MerchantProduct) => ({
        id: p._id || p.id,
        name: p.name,
        cover: p.cover || '',
        minPriceYuan: formatYuan(p.minPrice),
        totalStock: Number(p.totalStock) || 0,
        sales: Number(p.sales) || 0,
        status: p.status
      }));
      this.setData({ products, loading: false });
    } catch (err: any) {
      this.setData({ loading: false });
      wx.showToast({ title: err?.message || '商品加载失败', icon: 'none' });
    }
  },

  onStatusTab(e: any) {
    const key = e.currentTarget.dataset.key;
    this.setData({ statusTab: key }, () => this.loadProducts(true));
  },

  onSearchInput(e: any) {
    this.setData({ keyword: e.detail.value });
  },

  onSearchConfirm() {
    this.loadProducts(true);
  },

  onSearchClear() {
    this.setData({ keyword: '' }, () => this.loadProducts(true));
  },

  // ---------------- 表单 ----------------
  onOpenCreate() {
    this.setData({
      showForm: true,
      formMode: 'create',
      formId: '',
      form: { name: '', cover: '', categoryIndex: 0, price: '', stock: '', tags: [], deliveryTypes: ['DELIVERY'] },
      tagInput: ''
    });
  },

  async onOpenEdit(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await MerchantService.getProduct(id);
      const p = res.product || {};
      const catIndex = Math.max(0, this.data.categories.findIndex((c: any) => c.id === p.categoryId));
      this.setData({
        showForm: true,
        formMode: 'edit',
        formId: id,
        form: {
          name: p.name || '',
          cover: p.cover || '',
          categoryIndex: catIndex,
          price: p.minPrice ? (Number(p.minPrice) / 100).toFixed(2) : '',
          stock: p.totalStock != null ? String(p.totalStock) : '',
          tags: Array.isArray(p.tags) ? p.tags : [],
          deliveryTypes: Array.isArray(p.deliveryTypes) && p.deliveryTypes.length ? p.deliveryTypes : ['DELIVERY']
        },
        tagInput: ''
      });
      wx.hideLoading();
    } catch (err: any) {
      wx.hideLoading();
      wx.showToast({ title: err?.message || '加载失败', icon: 'none' });
    }
  },

  onCloseForm() {
    this.setData({ showForm: false });
  },

  onFormInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onCategoryChange(e: any) {
    this.setData({ 'form.categoryIndex': Number(e.detail.value) || 0 });
  },

  onTagInput(e: any) {
    this.setData({ tagInput: e.detail.value });
  },

  onAddTag() {
    const tag = (this.data.tagInput || '').trim();
    if (!tag) return;
    if (this.data.form.tags.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    this.setData({ 'form.tags': [...this.data.form.tags, tag], tagInput: '' });
  },

  onRemoveTag(e: any) {
    const tag = e.currentTarget.dataset.tag;
    this.setData({ 'form.tags': this.data.form.tags.filter((t: string) => t !== tag) });
  },

  onDeliveryToggle(e: any) {
    const type = e.currentTarget.dataset.type;
    const cur = this.data.form.deliveryTypes;
    const next = cur.includes(type) ? cur.filter((t: string) => t !== type) : [...cur, type];
    if (next.length === 0) {
      wx.showToast({ title: '至少保留一种配送方式', icon: 'none' });
      return;
    }
    this.setData({ 'form.deliveryTypes': next });
  },

  onChooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res: any) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        const tempPath = file.tempFilePath;
        const ext = (tempPath.split('.').pop() || 'jpg').toLowerCase();
        wx.getFileSystemManager().readFile({
          filePath: tempPath,
          encoding: 'base64',
          success: async (readRes: any) => {
            const base64 = `data:image/${ext};base64,${readRes.data}`;
            wx.showLoading({ title: '上传中...' });
            try {
              const up = await MerchantService.uploadImage(base64, `cover_${Date.now()}.${ext}`);
              this.setData({ 'form.cover': up.url || base64 });
              wx.hideLoading();
              wx.showToast({ title: '封面已上传', icon: 'success' });
            } catch (e: any) {
              wx.hideLoading();
              wx.showToast({ title: e?.message || '上传失败', icon: 'none' });
            }
          }
        });
      }
    });
  },

  async onSave() {
    const f = this.data.form;
    const name = (f.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写商品名称', icon: 'none' });
      return;
    }
    if (!f.cover) {
      wx.showToast({ title: '请上传商品封面', icon: 'none' });
      return;
    }
    const priceFen = Math.round(parseFloat(f.price || '0') * 100);
    if (!priceFen || priceFen <= 0) {
      wx.showToast({ title: '请填写有效价格', icon: 'none' });
      return;
    }
    const stock = parseInt(f.stock || '0', 10);
    if (isNaN(stock) || stock < 0) {
      wx.showToast({ title: '请填写有效库存', icon: 'none' });
      return;
    }
    const categoryId = this.data.categories[this.data.form.categoryIndex]?.id || '';

    const payload: any = {
      name,
      cover: f.cover,
      categoryId,
      minPrice: priceFen,
      totalStock: stock,
      tags: f.tags,
      deliveryTypes: f.deliveryTypes
    };

    this.setData({ saving: true });
    try {
      if (this.data.formMode === 'edit') {
        await MerchantService.updateProduct({ id: this.data.formId, ...payload });
        wx.showToast({ title: '已提交审核，等待平台通过', icon: 'none' });
      } else {
        await MerchantService.createProduct(payload);
        wx.showToast({ title: '已提交审核，等待平台通过', icon: 'none' });
      }
      this.setData({ showForm: false, saving: false });
      this.loadProducts(true);
    } catch (err: any) {
      this.setData({ saving: false });
      wx.showToast({ title: err?.message || '保存失败', icon: 'none' });
    }
  },

  onToggleStatus(e: any) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    const next = status === 'ON_SALE' ? 'OFF_SALE' : 'ON_SALE';
    wx.showModal({
      title: '提示',
      content: next === 'ON_SALE' ? '确认上架该商品？' : '确认下架该商品？',
      success: async (r: any) => {
        if (r.confirm) {
          try {
            await MerchantService.updateProductStatus(id, next);
            wx.showToast({ title: next === 'ON_SALE' ? '已上架' : '已下架', icon: 'success' });
            this.loadProducts(true);
          } catch (e: any) {
            wx.showToast({ title: e?.message || '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  onDelete(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除商品',
      content: '删除后商品将下架，历史订单保留。此操作不可撤销。',
      confirmColor: '#FF5500',
      success: async (r: any) => {
        if (r.confirm) {
          try {
            await MerchantService.deleteProduct(id);
            wx.showToast({ title: '已删除', icon: 'none' });
            this.loadProducts(true);
          } catch (e: any) {
            wx.showToast({ title: e?.message || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  async onPullDownRefresh() {
    await this.loadProducts(true);
    wx.stopPullDownRefresh();
  }
});
