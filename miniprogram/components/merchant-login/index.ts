import { MerchantService, MerchantInfo } from '../../services/merchant.service';

Component({
  data: {
    loading: false
  },

  methods: {
    onGetPhone(e: any) {
      const detail = e.detail || {};
      const code = detail.code;
      if (!code) {
        const errMsg = detail.errMsg || '';
        console.error('[merchant-login] getPhoneNumber no code:', JSON.stringify(detail));
        if (errMsg.indexOf('deny') >= 0) {
          wx.showToast({ title: '已取消手机号授权', icon: 'none' });
        } else if (errMsg.indexOf('privacy') >= 0) {
          wx.showToast({ title: '请先同意隐私协议后重试', icon: 'none' });
        } else {
          wx.showToast({ title: '授权失败：' + (errMsg || '未获取到凭证'), icon: 'none' });
        }
        return;
      }
      this.setData({ loading: true });
      MerchantService.loginByPhone(code)
        .then((info: MerchantInfo) => {
          this.setData({ loading: false });
          this.triggerEvent('success', info);
        })
        .catch((err: any) => {
          this.setData({ loading: false });
          wx.showToast({ title: err?.message || '商户登录失败', icon: 'none' });
        });
    },

    onDevLogin() {
      this.setData({ loading: true });
      MerchantService.devLogin()
        .then((info: MerchantInfo) => {
          this.setData({ loading: false });
          this.triggerEvent('success', info);
        })
        .catch((err: any) => {
          this.setData({ loading: false });
          wx.showToast({ title: err?.message || '开发登录失败', icon: 'none' });
        });
    }
  }
});
