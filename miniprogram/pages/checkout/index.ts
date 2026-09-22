import { CartItemModel, CartService } from '../../services/cart.service';
import { AddressService, CloudAddress } from '../../services/address.service';
import { OrderService } from '../../services/order.service';
import { PickupPoint, PickupService } from '../../services/pickup.service';

const CHECKOUT_KEY = 'sneaker_checkout_items';
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
    deliveryType: 'DELIVERY' as 'DELIVERY' | 'PICKUP',
    
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

    // 自提点
    pickupPoints: [] as PickupPoint[],
    selectedPickupPoint: null as PickupPoint | null,

    requestId: '',
    submitting: false,
    paying: false
  },

  async onLoad(options?: any) {
    const items = wx.getStorageSync(CHECKOUT_KEY);
    if (!Array.isArray(items) || items.length === 0) {
      wx.showToast({ title: '没有待结算商品', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }

    const defaultDelivery = (options?.deliveryType === 'PICKUP' || options?.deliveryType === 'store_pickup') ? 'PICKUP' : 'DELIVERY';
    const prePointId = options?.pickupPointId || '';
    const lastAddrId = wx.getStorageSync(LAST_USED_ADDR_KEY) || '';

    const requestId = `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    this.setData({
      items,
      requestId,
      deliveryType: defaultDelivery,
      lastSelectedAddressId: lastAddrId
    }, () => this.calculateTotal());

    await this.loadPickupPoints(prePointId);

    if (defaultDelivery === 'DELIVERY') {
      await this.reloadAndApplyAddressRules();
    }
  },

  async onShow() {
    // 页面从后台或外部唤回时，若是快递模式，静默刷新地址数据
    if (this.data.deliveryType === 'DELIVERY' && !this.data.showAddressPickerModal && !this.data.showAddAddressModal) {
      await this.reloadAndApplyAddressRules(false);
    }
  },

  calculateTotal() {
    this.setData({
      totalPrice: this.data.items.reduce((sum, item) => sum + item.price * item.count, 0)
    });
  },

  async loadPickupPoints(preferredId?: string) {
    try {
      const points = (await PickupService.list()).filter(point => point.status !== 'DISABLED');
      let selected = points[0] || null;
      if (preferredId) {
        const found = points.find(p => p.id === preferredId || (p as any)._id === preferredId);
        if (found) selected = found;
      }
      this.setData({ pickupPoints: points, selectedPickupPoint: selected });
    } catch (err) {
      console.warn('[checkout] load pickup points failed:', err);
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
      let chosen = list.find(a => a.isDefault);
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
      let chosen = list.find(a => a.isDefault);
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
   * 配送方式切换
   */
  async onSelectDelivery(e: any) {
    const type = e.currentTarget.dataset.type;
    if (type !== 'DELIVERY' && type !== 'PICKUP') return;

    if (type === 'PICKUP') {
      // 快递 -> 自提: 立即关闭地址选择器，地址不再作为必填项
      this.setData({
        deliveryType: 'PICKUP',
        showAddressPickerModal: false,
        showAddAddressModal: false
      });
      if (this.data.pickupPoints.length === 0) {
        await this.loadPickupPoints();
      }
    } else {
      // 自提 -> 快递: 重新加载地址并执行地址规则判断
      this.setData({ deliveryType: 'DELIVERY' });
      await this.reloadAndApplyAddressRules(true);
    }
  },

  onSelectPickupPoint(e: any) {
    const point = this.data.pickupPoints[Number(e.currentTarget.dataset.index)];
    if (point) this.setData({ selectedPickupPoint: point });
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
    } catch (saveErr: any) {
      wx.hideLoading();
      wx.showToast({ title: saveErr?.message || '保存地址失败，请重试', icon: 'none' });
    } finally {
      this.setData({ savingAddress: false });
    }
  },

  /**
   * 提交订单并调起微信支付真实链路
   */
  async submitOrder() {
    if (this.data.submitting || this.data.paying) return;

    // 快递订单严格检查收货地址
    if (this.data.deliveryType === 'DELIVERY') {
      if (!this.data.selectedAddress || !(this.data.selectedAddress.id || (this.data.selectedAddress as any)._id)) {
        wx.showToast({ title: '请选择收货地址', icon: 'none' });
        return;
      }
    }

    // 自提订单检查自提点
    if (this.data.deliveryType === 'PICKUP' && !this.data.selectedPickupPoint) {
      wx.showToast({ title: '请选择有效自提点', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    const checkoutStart = Date.now();
    console.log(`[CHECKOUT-01] 开始提交订单, 配送方式: ${this.data.deliveryType}, t=0ms`);
    wx.showLoading({ title: '创建订单中...' });

    try {
      // 快递订单必须包含未脱敏真实手机号快照
      const selectedAddr = this.data.selectedAddress;
      const unmaskedPhone = selectedAddr ? selectedAddr.phone : '';

      const receiverSnapshot = this.data.deliveryType === 'DELIVERY' && selectedAddr ? {
        name: selectedAddr.name,
        phone: unmaskedPhone, // 完整真实手机号，严禁脱敏入库
        province: selectedAddr.province,
        city: selectedAddr.city,
        district: selectedAddr.district || '',
        detail: selectedAddr.detail,
        tag: selectedAddr.tag || ''
      } : undefined;

      const result = await OrderService.createOrder({
        items: this.data.items.map(item => ({
          skuId: item.skuId || '',
          count: item.count,
          cartId: item.cartId || item.id,
          productId: item.productId,
          productName: item.title,
          image: item.image,
          price: item.price
        })),
        deliveryType: this.data.deliveryType,
        addressId: this.data.deliveryType === 'DELIVERY' ? this.data.selectedAddressId : undefined,
        shippingAddress: receiverSnapshot,
        receiverSnapshot: receiverSnapshot,
        pickupPointId: this.data.deliveryType === 'PICKUP' ? (this.data.selectedPickupPoint!.id || (this.data.selectedPickupPoint as any)!._id) : undefined,
        requestId: this.data.requestId
      });

      console.log(`[CHECKOUT-02] 商城订单创建成功 (orderId: ${result.orderId}), 耗时: ${Date.now() - checkoutStart}ms`);

      // 清除购物车中已购买的条目与缓存
      for (const item of this.data.items) {
        const cartId = item.cartId || item.id;
        if (cartId && !cartId.startsWith('buy_')) {
          await CartService.removeItem(cartId).catch(() => {});
        }
      }
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
          wx.showToast({ title: '支付成功！', icon: 'success' });
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
          wx.redirectTo({ url: `/pages/order/detail/index?id=${result.orderId}` });
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
      wx.showToast({ title: createErr?.message || '创建订单失败，请重试', icon: 'none' });
    } finally {
      try { wx.hideLoading(); } catch (_) {}
      this.setData({ submitting: false, paying: false });
    }
  }
});

