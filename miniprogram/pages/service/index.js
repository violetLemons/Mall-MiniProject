"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const store_1 = require("../../config/store");
Page({
    data: {
        customerServicePhone: store_1.STORE_CONFIG.customerServicePhone
    },
    /**
     * 拨打客服专线
     */
    onCallHotline() {
        if (!this.data.customerServicePhone)
            return;
        wx.makePhoneCall({
            phoneNumber: this.data.customerServicePhone,
            fail: () => {
                wx.showToast({ title: '已取消拨打', icon: 'none' });
            }
        });
    }
});
