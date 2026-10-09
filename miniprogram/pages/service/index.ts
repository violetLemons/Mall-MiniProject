import { STORE_CONFIG } from '../../config/store';

Page({
  data: {
    customerServicePhone: STORE_CONFIG.customerServicePhone
  },

  /**
   * 拨打客服专线
   */
  onCallHotline() {
    if (!this.data.customerServicePhone) return;
    wx.makePhoneCall({
      phoneNumber: this.data.customerServicePhone,
      fail: () => {
        wx.showToast({ title: '已取消拨打', icon: 'none' });
      }
    });
  }
});
