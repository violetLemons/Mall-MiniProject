import { MerchantService, MerchantInfo } from '../../../services/merchant.service';

Page({
  data: {
    isLoggedIn: false,
    merchant: null as MerchantInfo | null,
    name: '',
    address: '',
    phone: '',
    currentMask: '',
    subMchIdInput: '',
    profileSaving: false,
    subMchSaving: false
  },

  onLoad() {
    this.init();
  },

  init() {
    const merchant = MerchantService.getMerchant();
    this.setData({
      isLoggedIn: !!merchant,
      merchant,
      name: merchant?.name || '',
      address: merchant?.address || '',
      phone: merchant?.phone || '',
      currentMask: merchant?.subMchIdMask || ''
    });
  },

  onMerchantLogin() {
    this.init();
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`${field}`]: e.detail.value });
  },

  async onSaveProfile() {
    const name = (this.data.name || '').trim();
    const address = (this.data.address || '').trim();
    const phone = (this.data.phone || '').trim();
    if (!name && !address && !phone) {
      wx.showToast({ title: '名称、地址与手机号不能同时为空', icon: 'none' });
      return;
    }
    if (name && (name.length < 2 || name.length > 64)) {
      wx.showToast({ title: '商户名称需为 2-64 个字符', icon: 'none' });
      return;
    }
    if (address.length > 200) {
      wx.showToast({ title: '地址不能超过 200 字', icon: 'none' });
      return;
    }
    if (phone && !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    this.setData({ profileSaving: true });
    try {
      const res = await MerchantService.updateProfile({ name, address, phone });
      MerchantService.updateStored({ name: res.name || name, address: res.address || address, phone: res.phone || phone });
      this.setData({
        name: res.name || name,
        address: res.address || address,
        phone: res.phone || phone,
        profileSaving: false
      });
      wx.showToast({ title: '商户资料已保存', icon: 'success' });
    } catch (e: any) {
      this.setData({ profileSaving: false });
      wx.showToast({ title: e?.message || '保存失败', icon: 'none' });
    }
  },

  async onSaveSubMchId() {
    const val = (this.data.subMchIdInput || '').trim();
    if (!/^\d{8,32}$/.test(val)) {
      wx.showToast({ title: '商户号需为 8-32 位数字', icon: 'none' });
      return;
    }
    this.setData({ subMchSaving: true });
    try {
      const res = await MerchantService.setSubMchId(val);
      MerchantService.updateStored({ subMchIdMask: res.subMchIdMask });
      this.setData({ currentMask: res.subMchIdMask, subMchIdInput: '', subMchSaving: false });
      wx.showToast({ title: '商户号已加密保存', icon: 'success' });
    } catch (e: any) {
      this.setData({ subMchSaving: false });
      wx.showToast({ title: e?.message || '保存失败', icon: 'none' });
    }
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确认退出商户端登录？',
      success: (r: any) => {
        if (r.confirm) {
          MerchantService.logout();
          this.setData({ isLoggedIn: false, merchant: null });
          wx.showToast({ title: '已退出', icon: 'none' });
        }
      }
    });
  }
});
