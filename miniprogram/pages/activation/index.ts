import { ActivationService, ActivationRedeemResult } from '../../services/activation.service';

interface ActivationViewModel {
  success: boolean;
  message: string;
  benefit?: string;
  type?: string;
  value?: number;
}

Page({
  data: {
    code: '',
    loading: false,
    result: null as ActivationViewModel | null
  },

  onCodeInput(e: any) {
    this.setData({ code: e.detail.value });
  },

  async onRedeem() {
    const code = String(this.data.code || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入卡密', icon: 'none' });
      return;
    }

    this.setData({ loading: true, result: null });
    try {
      const res: ActivationRedeemResult = await ActivationService.redeem(code);
      this.setData({
        result: {
          success: true,
          message: '兑换成功',
          benefit: res.benefit,
          type: res.type,
          value: res.value
        }
      });
      wx.showToast({ title: '兑换成功', icon: 'success' });
    } catch (err: any) {
      this.setData({
        result: {
          success: false,
          message: err?.message || '兑换失败，请稍后重试'
        }
      });
      wx.showToast({ title: err?.message || '兑换失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
