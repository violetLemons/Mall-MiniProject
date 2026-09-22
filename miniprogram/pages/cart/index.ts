import { CartService, CartItemModel } from '../../services/cart.service';
import { OrderService } from '../../services/order.service';
import { AddressService, CloudAddress } from '../../services/address.service';
import { PickupService, PickupPoint } from '../../services/pickup.service';

Page({
  data: {
    cartItems: [] as CartItemModel[],
    allSelected: true,
    totalPrice: 0,
    selectedCount: 0,
    loading: false,
    deliveryType: 'DELIVERY' as 'DELIVERY' | 'PICKUP',
    selectedAddress: null as CloudAddress | null,
    pickupPoints: [] as PickupPoint[],
    selectedPickupPoint: null as PickupPoint | null
  },

  async onShow() {
    await this.loadCart();
    await this.loadCheckoutOptions();
  },

  async loadCheckoutOptions() {
    const [address, points] = await Promise.all([
      AddressService.getDefault().catch(() => null),
      PickupService.list().catch(() => [])
    ]);
    this.setData({
      selectedAddress: address,
      pickupPoints: points.filter(point => point.status !== 'DISABLED'),
      selectedPickupPoint: points.find(point => point.status !== 'DISABLED') || null
    });
  },

  onSelectDelivery(e: any) {
    const type = e.currentTarget.dataset.type;
    if (type === 'DELIVERY' || type === 'PICKUP') this.setData({ deliveryType: type });
  },

  onSelectPickupPoint(e: any) {
    const point = this.data.pickupPoints[Number(e.currentTarget.dataset.index)];
    if (point) this.setData({ selectedPickupPoint: point });
  },

  onOpenAddress() {
    wx.switchTab({ url: '/pages/profile/index' });
  },

  async loadCart() {
    try {
      const items = await CartService.getCart();
      const allSelected = items.length > 0 && items.every(i => i.selected);
      this.setData({
        cartItems: items,
        allSelected
      }, () => {
        this.calculateTotal();
      });
    } catch (e) {
      console.error('Failed to load cart:', e);
      this.calculateTotal();
    }
  },

  async toggleItemSelect(e: any) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.cartItems[index];
    if (item) {
      const nextSelect = !item.selected;
      const key = `cartItems[${index}].selected`;
      this.setData({ [key]: nextSelect }, () => {
        this.calculateTotal();
      });
      try {
        await CartService.toggleSelect(item.id || item.cartId || '', nextSelect);
      } catch (err: any) {
        this.setData({ [key]: !nextSelect }, () => this.calculateTotal());
        wx.showToast({ title: err?.message || '更新购物车失败，已恢复', icon: 'none' });
      }
    }
  },

  async toggleSelectAll() {
    const nextSelect = !this.data.allSelected;
    const previous = this.data.cartItems.map(item => ({ ...item }));
    const updated = this.data.cartItems.map(item => ({
      ...item,
      selected: nextSelect
    }));
    this.setData({
      cartItems: updated,
      allSelected: nextSelect
    }, () => {
      this.calculateTotal();
    });

    try {
      for (const item of updated) {
        await CartService.toggleSelect(item.id || item.cartId || '', nextSelect);
      }
    } catch (err: any) {
      this.setData({ cartItems: previous }, () => this.calculateTotal());
      wx.showToast({ title: err?.message || '更新购物车失败，已恢复', icon: 'none' });
    }
  },

  async onCountMinus(e: any) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.cartItems[index];
    if (item && item.count > 1) {
      const nextCount = item.count - 1;
      const key = `cartItems[${index}].count`;
      this.setData({ [key]: nextCount }, () => {
        this.calculateTotal();
      });
      try {
        await CartService.updateCount(item.id || item.cartId || '', nextCount);
      } catch (err: any) {
        this.setData({ [key]: item.count }, () => this.calculateTotal());
        wx.showToast({ title: err?.message || '更新数量失败，已恢复', icon: 'none' });
      }
    }
  },

  async onCountPlus(e: any) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.cartItems[index];
    if (item && item.count < 5) {
      const nextCount = item.count + 1;
      const key = `cartItems[${index}].count`;
      this.setData({ [key]: nextCount }, () => {
        this.calculateTotal();
      });
      try {
        await CartService.updateCount(item.id || item.cartId || '', nextCount);
      } catch (err: any) {
        this.setData({ [key]: item.count }, () => this.calculateTotal());
        wx.showToast({ title: err?.message || '更新数量失败，已恢复', icon: 'none' });
      }
    } else {
      wx.showToast({ title: '单款限购 5 双', icon: 'none' });
    }
  },

  deleteItem(e: any) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.cartItems[index];
    if (!item) return;

    wx.showModal({
      title: '提示',
      content: '确定从购物车删除该商品吗？',
      confirmColor: '#FF5500',
      success: async (res) => {
        if (res.confirm) {
          const updated = [...this.data.cartItems];
          updated.splice(index, 1);
          this.setData({ cartItems: updated }, () => {
            this.calculateTotal();
          });
          try {
            await CartService.removeItem(item.id || item.cartId || '');
          } catch (err: any) {
            const restored = [...this.data.cartItems];
            restored.splice(Math.min(index, restored.length), 0, item);
            this.setData({ cartItems: restored }, () => this.calculateTotal());
            wx.showToast({ title: err?.message || '删除失败，已恢复', icon: 'none' });
          }
        }
      }
    });
  },

  calculateTotal() {
    let total = 0;
    let count = 0;
    let all = this.data.cartItems.length > 0;

    for (const item of this.data.cartItems) {
      if (item.selected) {
        total += item.price * item.count;
        count += item.count;
      } else {
        all = false;
      }
    }

    this.setData({
      totalPrice: total,
      selectedCount: count,
      allSelected: all
    });
  },

  async onCheckout() {
    if (this.data.selectedCount === 0) {
      wx.showToast({ title: '请先勾选需要结算的商品', icon: 'none' });
      return;
    }

    const selectedItems = this.data.cartItems.filter(i => i.selected);

    wx.setStorageSync('sneaker_checkout_items', selectedItems);
    wx.navigateTo({ url: '/pages/checkout/index' });
  },

  onGoShopping() {
    wx.switchTab({ url: '/pages/home/index' });
  }
});
