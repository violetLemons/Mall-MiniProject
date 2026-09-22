import { STORE_CONFIG } from '../../config/store';

Page({
  data: {
    customerServicePhone: STORE_CONFIG.customerServicePhone || '400-000-0000'
  },

  /**
   * 拨打客服专线
   */
  onCallHotline() {
    wx.makePhoneCall({
      phoneNumber: this.data.customerServicePhone || '400-000-0000',
      fail: () => {
        wx.showToast({ title: '已取消拨打', icon: 'none' });
      }
    });
  },

  /**
   * 在线客服（微信客服消息）
   */
  onContactService() {
    wx.showToast({ title: '在线客服已接入', icon: 'none' });
  }
});
