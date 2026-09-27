"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const merchant_service_1 = require("../../services/merchant.service");
Component({
    data: {
        loading: false
    },
    methods: {
        onGetPhone(e) {
            const detail = e.detail || {};
            const code = detail.code;
            if (!code) {
                const errMsg = detail.errMsg || '';
                console.error('[merchant-login] getPhoneNumber no code:', JSON.stringify(detail));
                if (errMsg.indexOf('deny') >= 0) {
                    wx.showToast({ title: '已取消手机号授权', icon: 'none' });
                }
                else if (errMsg.indexOf('privacy') >= 0) {
                    wx.showToast({ title: '请先同意隐私协议后重试', icon: 'none' });
                }
                else {
                    wx.showToast({ title: '授权失败：' + (errMsg || '未获取到凭证'), icon: 'none' });
                }
                return;
            }
            this.setData({ loading: true });
            merchant_service_1.MerchantService.loginByPhone(code)
                .then((info) => {
                this.setData({ loading: false });
                this.triggerEvent('success', info);
            })
                .catch((err) => {
                this.setData({ loading: false });
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '商户登录失败', icon: 'none' });
            });
        }
    }
});
