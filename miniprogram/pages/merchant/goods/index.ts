import { MerchantService, MerchantInfo, MerchantProduct, formatYuan } from '../../../services/merchant.service';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

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
    categories: [] as any[],
    level1Categories: [] as any[],
    level2Categories: [] as any[],
    parentCategoryIndex: 0,
    categoryIndex: 0,
    // 表单
    showForm: false,
    formMode: 'create' as 'create' | 'edit',
    formId: '',
    form: {
      name: '',
      subtitle: '',
      description: '',
      cover: '',
      categoryId: '',
      price: '',
      tags: [] as string[],
      deliveryTypes: ['DELIVERY'] as string[],
      detailImages: [] as string[]
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
      const list = Array.isArray(cats) ? cats : [];
      const level1 = list.filter((c: any) => !c.parentId);
      this.setData({ categories: list, level1Categories: level1 });
      this.rebuildLevel2((level1[0] && (level1[0].id || level1[0]._id)) || '');
    } catch (err) {
      console.warn('[goods] load categories failed', err);
      this.setData({ categories: [], level1Categories: [], level2Categories: [] });
    }
  },

  rebuildLevel2(parentId: string) {
    const level2 = this.data.categories.filter((c: any) => c.parentId === parentId);
    this.setData({ level2Categories: level2 });
    return level2;
  },

  resolveCategorySelection(categoryId: string): { parentIndex: number; childIndex: number } {
    const cat = this.data.categories.find((c: any) => (c.id || c._id) === categoryId);
    if (!cat) return { parentIndex: 0, childIndex: 0 };
    if (cat.parentId) {
      const parentIndex = Math.max(0, this.data.level1Categories.findIndex((c: any) => (c.id || c._id) === cat.parentId));
      const level2 = this.data.categories.filter((c: any) => c.parentId === cat.parentId);
      const childIndex = Math.max(0, level2.findIndex((c: any) => (c.id || c._id) === categoryId));
      return { parentIndex, childIndex };
    }
    const parentIndex = Math.max(0, this.data.level1Categories.findIndex((c: any) => (c.id || c._id) === categoryId));
    return { parentIndex, childIndex: 0 };
  },

  resolveCategoryId(): string {
    const level2 = this.data.level2Categories;
    if (level2.length > 0) {
      const c = level2[this.data.categoryIndex] || level2[0];
      return c ? (c.id || c._id) : '';
    }
    const c = this.data.level1Categories[this.data.parentCategoryIndex];
    return c ? (c.id || c._id) : '';
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
      parentCategoryIndex: 0,
      categoryIndex: 0,
      form: {
        name: '',
        subtitle: '',
        description: '',
        cover: '',
        categoryId: '',
        price: '',
        tags: [],
        deliveryTypes: ['DELIVERY'],
        detailImages: []
      },
      tagInput: ''
    });
    const level1 = this.data.level1Categories;
    this.rebuildLevel2((level1[0] && (level1[0].id || level1[0]._id)) || '');
  },

  async onOpenEdit(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await MerchantService.getProduct(id);
      const p = res.product || {};
      const sel = this.resolveCategorySelection(p.categoryId);
      this.setData({
        showForm: true,
        formMode: 'edit',
        formId: id,
        parentCategoryIndex: sel.parentIndex,
        categoryIndex: sel.childIndex,
        form: {
          name: p.name || '',
          subtitle: p.subtitle || '',
          description: p.description || '',
          cover: p.coverFileID || p.cover || '',
          categoryId: p.categoryId || '',
          price: p.minPrice ? (Number(p.minPrice) / 100).toFixed(2) : '',
          tags: Array.isArray(p.tags) ? p.tags : [],
          deliveryTypes: Array.isArray(p.deliveryTypes) && p.deliveryTypes.length ? p.deliveryTypes : ['DELIVERY'],
          detailImages: Array.isArray(p.detailImagesFileIDs) && p.detailImagesFileIDs.length
            ? p.detailImagesFileIDs
            : (Array.isArray(p.detailImages) ? p.detailImages : [])
        },
        tagInput: ''
      });
      const parentId = (this.data.level1Categories[sel.parentIndex] && (this.data.level1Categories[sel.parentIndex].id || this.data.level1Categories[sel.parentIndex]._id)) || '';
      this.rebuildLevel2(parentId);
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

  onParentCategoryChange(e: any) {
    const idx = Number(e.detail.value) || 0;
    const level1 = this.data.level1Categories;
    const parentId = (level1[idx] && (level1[idx].id || level1[idx]._id)) || '';
    this.setData({ parentCategoryIndex: idx, categoryIndex: 0 });
    this.rebuildLevel2(parentId);
  },

  onCategoryChange(e: any) {
    this.setData({ categoryIndex: Number(e.detail.value) || 0 });
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

  // 读取本地图片 → base64 上传到云存储，返回永久 fileID（cloud://）
  uploadToCloud(tempPath: string, prefix: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const rawExt = (tempPath.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ext = IMAGE_EXTS.includes(rawExt) ? rawExt : 'jpg';
      wx.getFileSystemManager().readFile({
        filePath: tempPath,
        encoding: 'base64',
        success: async (readRes: any) => {
          try {
            const base64 = `data:image/${ext};base64,${readRes.data}`;
            const up = await MerchantService.uploadImage(base64, `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`);
            resolve(up.fileID || up.url || base64);
          } catch (err) {
            reject(err);
          }
        },
        fail: reject
      });
    });
  },

  onChooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res: any) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        wx.showLoading({ title: '上传中...' });
        this.uploadToCloud(file.tempFilePath, 'cover')
          .then((fileID) => {
            this.setData({ 'form.cover': fileID });
            wx.hideLoading();
            wx.showToast({ title: '封面已上传', icon: 'success' });
          })
          .catch((err: any) => {
            wx.hideLoading();
            wx.showToast({ title: err?.message || '上传失败', icon: 'none' });
          });
      }
    });
  },

  onChooseDetailImages() {
    const remain = 9 - this.data.form.detailImages.length;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 9 张详情图', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      success: async (res: any) => {
        const files = res.tempFiles || [];
        if (!files.length) return;
        wx.showLoading({ title: '上传中...' });
        try {
          const ids: string[] = [];
          for (const f of files) {
            if (!f.tempFilePath) continue;
            ids.push(await this.uploadToCloud(f.tempFilePath, 'detail'));
          }
          this.setData({ 'form.detailImages': [...this.data.form.detailImages, ...ids] });
          wx.hideLoading();
          wx.showToast({ title: `已上传 ${ids.length} 张`, icon: 'success' });
        } catch (err: any) {
          wx.hideLoading();
          wx.showToast({ title: err?.message || '上传失败', icon: 'none' });
        }
      }
    });
  },

  onRemoveDetailImage(e: any) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({ 'form.detailImages': this.data.form.detailImages.filter((_: string, i: number) => i !== idx) });
  },

  async onSave() {
    const f = this.data.form;
    const name = (f.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请填写商品名称', icon: 'none' });
      return;
    }
    const subtitle = (f.subtitle || '').trim();
    if (!subtitle) {
      wx.showToast({ title: '请填写商品副标题', icon: 'none' });
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
    const categoryId = this.resolveCategoryId();
    if (!categoryId) {
      wx.showToast({ title: '请选择商品分类', icon: 'none' });
      return;
    }

    const payload: any = {
      name,
      subtitle,
      description: f.description || '',
      cover: f.cover,
      categoryId,
      minPrice: priceFen,
      maxPrice: priceFen,
      images: f.detailImages.length ? f.detailImages : [f.cover],
      detailImages: f.detailImages,
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
