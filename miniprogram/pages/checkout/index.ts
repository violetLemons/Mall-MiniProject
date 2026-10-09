import { CartItemModel } from '../../services/cart.service';
import { AddressService, CloudAddress } from '../../services/address.service';
import { OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';

const CHECKOUT_KEY = 'sneaker_checkout_items';
const INTENT_KEY = 'mall_checkout_intent';
const LAST_USED_ADDR_KEY = 'sneaker_last_used_address_id';

function maskPhone(phone: string): string {
  const s = String(phone || '').trim();
  if (s.length === 11) {
    return `${s.slice(0, 3)}****${s.slice(7)}`;
  }
  return s;
}

Page({
  data: {
    items: [] as CartItemModel[],
    totalPrice: 0,
    shippingFee: 0,
    quoteKey: '',
    quoteError: '',
    quoteLoading: false,
    quoteVersion: 0,
    balance: 0,             // 可用购物额度（分）
    balanceDeduction: 0,    // 本单抵扣额度（分）
    payAmount: 0,

    // 地址相关数据
    addressList: [] as CloudAddress[],
    sortedAddresses: [] as (CloudAddress & { maskedPhone: string })[],
    selectedAddress: null as CloudAddress | null,
    selectedAddressId: '',
    maskedPhone: '',
    lastSelectedAddressId: '',

    // 弹窗状态
    showAddressPickerModal: false,
    showAddAddressModal: false,
    savingAddress: false,

    // 新增地址表单数据
    addAddressForm: {
      name: '',
      phone: '',
      province: '福建省',
      city: '示例市',
      district: '示例区',
      detail: '',
      tag: '家',
      isDefault: false
    },
    regionValue: ['福建省', '示例市', '示例区'],
    tagList: ['家', '公司', '学校', '常用'],

    requestId: '',
    submitting: false,
    paying: false
  },

  async onLoad(options?: any) {
    const intent = wx.getStorageSync(INTENT_KEY);
    const items = intent?.itemsSnapshot || wx.getStorageSync(CHECKOUT_KEY);
    if (!Array.isArray(items) || items.length === 0) {
      wx.showToast({ title: '没有待结算商品', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }

    const lastAddrId = wx.getStorageSync(LAST_USED_ADDR_KEY) || '';

    const requestId = intent?.params?.requestId || `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    this.setData({
      items,
      requestId,
      lastSelectedAddressId: lastAddrId
    });

    await this.loadBalance();

    {
      await this.reloadAndApplyAddressRules();
    }
  },

  async onShow() {
    // 页面从后台或外部唤回时，若是快递模式，静默刷新地址数据
    if (!this.data.showAddressPickerModal && !this.data.showAddAddressModal) {
      await this.reloadAndApplyAddressRules(false);
    }
  },

  calculateTotal() {
    const totalPrice = this.data.items.reduce((sum, item) => sum + item.price * item.count, 0);
    const balance = Math.max(0, Number(this.data.balance) || 0);
    const balanceDeduction = Math.min(balance, totalPrice + this.data.shippingFee);
    const payAmount = totalPrice + this.data.shippingFee - balanceDeduction;
    this.setData({ totalPrice, balanceDeduction, payAmount });
  },

  /**
   * 读取用户购物额度，并刷新本单抵扣与实付金额（后端下单时按库内余额权威计算，此处仅做展示预估）
   */
  async loadBalance() {
    const cached = AuthService.getCurrentUser();
    this.setData({ balance: Math.max(0, Number(cached?.balance) || 0) }, () => this.calculateTotal());
    try {
      const authRes = await AuthService.login().catch(() => null);
      if (authRes?.user) {
        this.setData({ balance: Math.max(0, Number(authRes.user.balance) || 0) }, () => this.calculateTotal());
      }
    } catch (_) {
      // 网络异常时沿用本地缓存余额预估
    }
  },

  /**
   * 读取当前登录用户真实的收货地址，并执行规则
   * @param allowAutoPop 是否允许触发规则4 (>2自动弹窗)
   */
  async reloadAndApplyAddressRules(allowAutoPop = true) {
    try {
      const list = (await AddressService.list()) || [];
      this.applyAddressRules(list, allowAutoPop);
      await this.refreshQuote();
    } catch (err) {
      console.error('[checkout] load address list error:', err);
      wx.showToast({ title: '加载地址失败，请重试', icon: 'none' });
    }
  },

  /**
   * 执行严格的地址数量判定业务规则:
   * 0个地址: 提示并打开新增弹窗
   * 1个地址: 自动选择唯一地址，不弹窗
   * 2个地址: 不自动弹窗，优先选择默认>最近使用>第一条；显示更换地址
   * >2个地址 (严格大于2): 自动弹出“选择收货地址”弹窗，默认置顶，其他按更新时间排序
   */
  applyAddressRules(list: CloudAddress[], allowAutoPop = true) {
    const lastUsedId = wx.getStorageSync(LAST_USED_ADDR_KEY) || this.data.lastSelectedAddressId;

    // 构建排序后的地址列表: 默认地址排第一，其余按更新时间降序
    const sorted = [...list].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      const tA = new Date(a.updatedAt || a.updateTime || 0).getTime();
      const tB = new Date(b.updatedAt || b.updateTime || 0).getTime();
      return tB - tA;
    }).map(addr => ({
      ...addr,
      maskedPhone: maskPhone(addr.phone)
    }));

    this.setData({
      addressList: list,
      sortedAddresses: sorted
    });

    // 情况 1: 0 个地址
    if (list.length === 0) {
      this.setData({
        selectedAddress: null,
        selectedAddressId: '',
        maskedPhone: '',
        showAddressPickerModal: false
      });
      wx.showToast({
        title: '您还没有收货地址，请先添加收货地址',
        icon: 'none',
        duration: 2000
      });
      this.setData({ showAddAddressModal: true });
      return;
    }

    // 情况 2: 1 个地址
    if (list.length === 1) {
      const onlyOne = list[0];
      const onlyId = onlyOne.id || (onlyOne as any)._id;
      this.setData({
        selectedAddress: onlyOne,
        selectedAddressId: onlyId,
        maskedPhone: maskPhone(onlyOne.phone),
        lastSelectedAddressId: onlyId,
        showAddressPickerModal: false,
        showAddAddressModal: false
      });
      return;
    }

    // 情况 3: 2 个地址
    if (list.length === 2) {
      // 优先默认地址
      let chosen = list.find(a=>(a.id || (a as any)._id)===this.data.selectedAddressId) || list.find(a => a.isDefault);
      // 无默认地址则优先最近使用地址
      if (!chosen && lastUsedId) {
        chosen = list.find(a => (a.id || (a as any)._id) === lastUsedId);
      }
      // 仍无则使用第一条有效地址
      if (!chosen) {
        chosen = list[0];
      }
      const chosenId = chosen.id || (chosen as any)._id;
      this.setData({
        selectedAddress: chosen,
        selectedAddressId: chosenId,
        maskedPhone: maskPhone(chosen.phone),
        lastSelectedAddressId: chosenId,
        showAddressPickerModal: false,
        showAddAddressModal: false
      });
      return;
    }

    // 情况 4: 超过 2 个地址 (addressList.length > 2)
    if (list.length > 2) {
      // 初始候选地址
      let chosen = list.find(a=>(a.id || (a as any)._id)===this.data.selectedAddressId) || list.find(a => a.isDefault);
      if (!chosen && lastUsedId) {
        chosen = list.find(a => (a.id || (a as any)._id) === lastUsedId);
      }
      if (!chosen) {
        chosen = list[0];
      }
      const chosenId = chosen.id || (chosen as any)._id;

      this.setData({
        selectedAddress: chosen,
        selectedAddressId: chosenId,
        maskedPhone: maskPhone(chosen.phone),
        lastSelectedAddressId: chosenId,
        // 严格 > 2 且允许弹窗时自动弹出
        showAddressPickerModal: allowAutoPop ? true : false,
        showAddAddressModal: false
      });
    }
  },

  /**
   * 用户点击地址卡片或“更换地址”按钮
   */
  onOpenAddressPicker() {
    if (this.data.addressList.length === 0) {
      wx.showToast({ title: '您还没有收货地址，请先添加收货地址', icon: 'none' });
      this.setData({ showAddAddressModal: true });
      return;
    }
    this.setData({ showAddressPickerModal: true });
  },

  onCloseAddressPicker() {
    this.setData({ showAddressPickerModal: false });
  },

  /**
   * 在弹窗中选中地址
   */
  onPickAddress(e: any) {
    const id = e.currentTarget.dataset.id;
    const found = this.data.addressList.find(a => (a.id || (a as any)._id) === id);
    if (found) {
      wx.setStorageSync(LAST_USED_ADDR_KEY, id);
      this.setData({
        selectedAddress: found,
        selectedAddressId: id,
        maskedPhone: maskPhone(found.phone),
        lastSelectedAddressId: id,
        showAddressPickerModal: false
      });
      this.refreshQuote();
    }
  },

  /**
   * 新增收货地址弹窗控制
   */
  onOpenAddAddressModal() {
    this.setData({
      showAddAddressModal: true,
      addAddressForm: {
        name: '',
        phone: '',
        province: '福建省',
        city: '示例市',
        district: '示例区',
        detail: '',
        tag: '家',
        isDefault: this.data.addressList.length === 0
      },
      regionValue: ['福建省', '示例市', '示例区']
    });
  },

  onCloseAddAddressModal() {
    this.setData({ showAddAddressModal: false });
  },

  onAddAddressInput(e: any) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    this.setData({
      [`addAddressForm.${field}`]: val
    });
  },

  onRegionChange(e: any) {
    const [province, city, district] = e.detail.value;
    this.setData({
      regionValue: [province, city, district],
      'addAddressForm.province': province,
      'addAddressForm.city': city,
      'addAddressForm.district': district
    });
  },

  onSelectTag(e: any) {
    const tag = e.currentTarget.dataset.tag;
    this.setData({ 'addAddressForm.tag': tag });
  },

  onDefaultSwitchChange(e: any) {
    this.setData({ 'addAddressForm.isDefault': !!e.detail.value });
  },

  /**
   * 保存并立即使用新添加的地址
   */
  async onSaveNewAddress() {
    if (this.data.savingAddress) return;
    const form = this.data.addAddressForm;

    const name = String(form.name || '').trim();
    const phone = String(form.phone || '').trim();
    const province = String(form.province || '').trim();
    const city = String(form.city || '').trim();
    const district = String(form.district || '').trim();
    const detail = String(form.detail || '').trim();

    if (!name) {
      wx.showToast({ title: '请输入收货人姓名', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' });
      return;
    }
    if (!province || !city) {
      wx.showToast({ title: '请选择所在省市区', icon: 'none' });
      return;
    }
    if (!detail) {
      wx.showToast({ title: '请输入详细地址', icon: 'none' });
      return;
    }

    this.setData({ savingAddress: true });
    wx.showLoading({ title: '保存地址中...' });

    try {
      const saved = await AddressService.save({
        name,
        phone, // 保存真实完整手机号
        province,
        city,
        district,
        detail,
        tag: form.tag || '家',
        isDefault: form.isDefault
      });

      // 刷新最新地址列表
      const freshList = (await AddressService.list()) || [];
      const newId = saved.id || (saved as any)._id;
      wx.setStorageSync(LAST_USED_ADDR_KEY, newId);

      // 重新计算并选中刚添加的地址
      const sorted = [...freshList].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        const tA = new Date(a.updatedAt || a.updateTime || 0).getTime();
        const tB = new Date(b.updatedAt || b.updateTime || 0).getTime();
        return tB - tA;
      }).map(addr => ({ ...addr, maskedPhone: maskPhone(addr.phone) }));

      this.setData({
        addressList: freshList,
        sortedAddresses: sorted,
        selectedAddress: saved,
        selectedAddressId: newId,
        maskedPhone: maskPhone(saved.phone),
        lastSelectedAddressId: newId,
        showAddAddressModal: false,
        showAddressPickerModal: false
      });

      wx.hideLoading();
      wx.showToast({ title: '收货地址已添加并选中', icon: 'success' });
      await this.refreshQuote();
    } catch (saveErr: any) {
      wx.hideLoading();
      wx.showToast({ title: saveErr?.message || '保存地址失败，请重试', icon: 'none' });
    } finally {
      this.setData({ savingAddress: false });
    }
  },

  buildParams() {
    return {items:this.data.items.map(item=>({skuId:item.skuId || '',count:item.count,cartId:item.cartId || (item.id?.startsWith('buy_')?undefined:item.id)})),addressId:this.data.selectedAddressId,requestId:this.data.requestId};
  },

  async refreshQuote() {
    if(!this.data.selectedAddressId)return;
    const version=this.data.quoteVersion+1;
    this.setData({quoteVersion:version,quoteLoading:true,quoteError:'',quoteKey:''});
    try {
      const quote=await OrderService.quote(this.buildParams());
      if(this.data.quoteVersion!==version)return;
      this.setData({totalPrice:quote.goodsAmount,shippingFee:quote.shippingFee,balanceDeduction:quote.balanceAmount,payAmount:quote.payAmount,quoteKey:quote.quoteKey});
    } catch(e:any) {
      if(this.data.quoteVersion===version)this.setData({quoteError:e.message || '配送报价失败'});
    } finally {if(this.data.quoteVersion===version)this.setData({quoteLoading:false});}
  },

  /**
   * 提交订单并调起微信支付真实链路
   */
  async submitOrder() {
    if (this.data.submitting || this.data.paying) return;

    // 快递订单严格检查收货地址
    {
      if (!wx.getStorageSync(INTENT_KEY) && (!this.data.selectedAddress || !(this.data.selectedAddress.id || (this.data.selectedAddress as any)._id))) {
        wx.showToast({ title: '请选择收货地址', icon: 'none' });
        return;
      }
    }

    this.setData({ submitting: true });
    const checkoutStart = Date.now();
    console.log(`[CHECKOUT-01] 开始提交订单, 配送方式: 快递, t=0ms`);
    wx.showLoading({ title: '创建订单中...' });

    try {
      let intent=wx.getStorageSync(INTENT_KEY);
      if(!intent) {
        const params=this.buildParams(),quote=await OrderService.quote(params);
        this.setData({totalPrice:quote.goodsAmount,shippingFee:quote.shippingFee,balanceDeduction:quote.balanceAmount,payAmount:quote.payAmount,quoteKey:quote.quoteKey});
        wx.hideLoading();
        const confirmed=await new Promise<any>(resolve=>wx.showModal({title:'确认付款金额',content:`商品 ¥${(quote.goodsAmount/100).toFixed(2)}，运费 ¥${(quote.shippingFee/100).toFixed(2)}，额度抵扣 ¥${(quote.balanceAmount/100).toFixed(2)}，现金 ¥${(quote.payAmount/100).toFixed(2)}。共 ${quote.orderCount} 件，按件生成订单。`,success:resolve}));
        if(!confirmed.confirm)return;
        intent={params:{...params,quoteKey:quote.quoteKey},itemsSnapshot:this.data.items};
        wx.setStorageSync(INTENT_KEY,intent);
      }
      // Replay the persisted request after a timeout, including across page re-entry.
      const result = await OrderService.createOrder(intent.params);
      wx.removeStorageSync(INTENT_KEY);

      console.log(`[CHECKOUT-02] 商城订单创建成功 (orderId: ${result.orderId}), 耗时: ${Date.now() - checkoutStart}ms`);

      // 后端已在下单事务中扣减购物车；这里不再删除，避免误删并发加购。
      wx.removeStorageSync(CHECKOUT_KEY);
      try { wx.hideLoading(); } catch (_) {}

      // 订单创建成功，立即拉起真实微信支付
      this.setData({ paying: true });
      console.log(`[CHECKOUT-03] 开始调起微信支付链路, orderId: ${result.orderId}, t=${Date.now() - checkoutStart}ms`);
      wx.showLoading({ title: '调起微信支付中...' });

      try {
        const payRes = await OrderService.payOrder(result.orderId);
        try { wx.hideLoading(); } catch (_) {}

        console.log(`[CHECKOUT-04] 支付流程返回, status: ${payRes?.status}, code: ${payRes?.code}, 总耗时: ${Date.now() - checkoutStart}ms`);

        if (payRes && payRes.status === 'PAID') {
          wx.showToast({ title: payRes.noPayment ? '已用购物额度抵扣完成' : '支付成功！', icon: 'success' });
          setTimeout(() => {
            wx.redirectTo({ url: `/pages/order/list/index` });
          }, 1200);
        } else if (payRes?.code === 'PAYMENT_CANCELLED') {
          wx.showToast({ title: '支付已取消', icon: 'none' });
          setTimeout(() => {
            wx.redirectTo({ url: `/pages/order/list/index` });
          }, 1200);
        } else if (payRes?.code === 'PAYMENT_PERMISSION_DENIED') {
          wx.showToast({ title: payRes?.message || '微信支付受限', icon: 'none', duration: 3000 });
          setTimeout(() => {
            wx.redirectTo({ url: `/pages/order/list/index` });
          }, 2000);
        } else {
          wx.showToast({ title: payRes?.message || '支付未完成，订单保留在待付款', icon: 'none', duration: 3000 });
          setTimeout(() => {
            wx.redirectTo({ url: `/pages/order/list/index` });
          }, 2000);
        }
      } catch (payErr: any) {
        try { wx.hideLoading(); } catch (_) {}
        console.error('[PAY-CLOUD-ERROR] [checkout payErr]:', {
          errMsg: payErr?.errMsg || payErr?.message,
          errCode: payErr?.errCode,
          errno: payErr?.errno,
          requestID: payErr?.requestID,
          stack: payErr?.stack,
          raw: payErr
        });
        wx.showToast({ title: payErr?.message || '支付未完成，订单已保留在待付款', icon: 'none' });
        setTimeout(() => {
          wx.redirectTo({ url: `/pages/order/detail/index?id=${result.orderIds?.[0] || result.orderId}` });
        }, 1500);
      }
    } catch (createErr: any) {
      try { wx.hideLoading(); } catch (_) {}
      console.error('[PAY-CLOUD-ERROR] [checkout createOrder error]:', {
        errMsg: createErr?.errMsg || createErr?.message,
        errCode: createErr?.errCode,
        errno: createErr?.errno,
        requestID: createErr?.requestID,
        stack: createErr?.stack,
        raw: createErr?.rawError || createErr
      });
      const definitive=['QUOTE_CHANGED','INVALID_PARAMS','INVALID_ADDRESS','DELIVERY_UNAVAILABLE','SKU_NOT_FOUND','PRODUCT_OFF_SALE','INVALID_SKU','PERMISSION_DENIED','USER_NOT_FOUND'];
      if(definitive.includes(createErr?.code)){wx.removeStorageSync(INTENT_KEY);await this.refreshQuote();}
      wx.showToast({ title: createErr?.message || '下单结果未确认，请重试核对原请求', icon: 'none' });
    } finally {
      try { wx.hideLoading(); } catch (_) {}
      this.setData({ submitting: false, paying: false });
    }
  }
});

