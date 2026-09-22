import { ProductItem } from '../../../models/product';
import { ProductService } from '../../../services/product.service';
import { CartService, CartItemModel } from '../../../services/cart.service';
import { OrderService } from '../../../services/order.service';
import { AddressService } from '../../../services/address.service';
import { PickupService, PickupPoint } from '../../../services/pickup.service';

Page({
  data: {
    id: '',
    product: {} as ProductItem,
    loading: true,
    errorMessage: '',
    currentImageIndex: 0,
    isFavorite: false,
    favoriteAnimating: false,
    cartCount: 0,
    cartPreviewVisible: false,
    cartItems: [] as CartItemModel[],
    cartTotalAmountYuan: '0.00',
    skuPopupVisible: false,
    skuActionType: 'both' as 'both' | 'cart' | 'buy',
    selectedSkuText: '点击选择 颜色 / 规格',
    selectedColor: null as any,
    selectedSize: null as any,
    selectedQuantity: 1,
    deliveryType: 'express', // 'express' | 'store_pickup'
    pickupPoints: [] as PickupPoint[],
    selectedPickupPoint: null as PickupPoint | null
  },

  onLoad(options: any) {
    const id = String(options.id || '').trim();
    if (!id) {
      wx.showToast({ title: '商品参数缺失，请返回重试', icon: 'none' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 500);
      return;
    }
    this.setData({ id });
    this.loadDetail(id);
  },

  onRetry() {
    if (this.data.id) this.loadDetail(this.data.id);
  },

  async loadDetail(id: string) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const product = await ProductService.getDetail(id);
      if (product) {
        this.setData({
          product,
          loading: false
        });
      } else {
        this.setData({ loading: false, errorMessage: '商品不存在或已下架' });
      }
    } catch (err) {
      console.error('Failed to load product detail:', err);
      this.setData({ loading: false, errorMessage: err instanceof Error ? err.message : '云端商品加载失败，请重试' });
    }
  },

  onSwiperChange(e: any) {
    this.setData({ currentImageIndex: e.detail.current });
  },

  onPreviewImage(e: any) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.product.images || [this.data.product.cover];
    wx.previewImage({
      current,
      urls
    });
  },

  onToggleFavorite() {
    const nextState = !this.data.isFavorite;
    this.setData({
      isFavorite: nextState,
      favoriteAnimating: true
    });

    setTimeout(() => {
      this.setData({ favoriteAnimating: false });
    }, 250);

    wx.showToast({
      title: nextState ? '已加入心愿单' : '已取消收藏',
      icon: 'none',
      duration: 1500
    });
  },

  onSelectDelivery(e: any) {
    const type = e.currentTarget.dataset.type;
    this.setData({ deliveryType: type });
    if (type === 'store_pickup' && this.data.pickupPoints.length === 0) {
      this.loadPickupPoints();
    }
  },

  async loadPickupPoints(): Promise<PickupPoint[]> {
    try {
      const points = (await PickupService.list()).filter(point => point.status !== 'DISABLED');
      this.setData({ pickupPoints: points, selectedPickupPoint: points[0] || null });
      if (!points.length) wx.showToast({ title: '暂无可用自提点', icon: 'none' });
      return points;
    } catch (err) {
      console.warn('[detail] load pickup points failed:', err);
      wx.showToast({ title: '自提点加载失败，请重试', icon: 'none' });
      return [];
    }
  },

  onSelectPickupPoint(e: any) {
    const index = Number(e.currentTarget.dataset.index);
    const point = this.data.pickupPoints[index];
    if (point) this.setData({ selectedPickupPoint: point });
  },

  onOpenSku(e: any) {
    const type = e.currentTarget.dataset.type || 'both';
    this.directAction(type);
  },

  // 单隐藏默认 SKU：不弹规格面板，直接用商品默认 SKU 加购/下单
  directAction(actionType: string) {
    const product: any = this.data.product;
    const sku = (product.skus && product.skus[0]) || null;
    const finalSkuId = sku?.skuId || sku?._id || sku?.id || '';
    if (!finalSkuId) {
      wx.showToast({ title: '商品信息已失效，请刷新', icon: 'none' });
      return;
    }
    const quantity = this.data.selectedQuantity || 1;

    if (actionType === 'cart') {
      CartService.addToCart(finalSkuId, quantity, {
        productId: product.id || product._id,
        title: product.title || product.name,
        skuText: '',
        price: product.price,
        image: product.cover
      }).then(() => {
        this.setData({ cartCount: this.data.cartCount + quantity });
        wx.showToast({ title: '已加入购物车', icon: 'success', duration: 1500 });
      }).catch((err) => {
        wx.showToast({ title: err.message || '加购失败', icon: 'none' });
      });
    } else {
      const checkoutItem = {
        id: `buy_${Date.now()}`,
        cartId: '',
        skuId: finalSkuId,
        productId: product.id || product._id,
        title: product.title || product.name || '商品',
        skuText: '',
        price: product.price,
        image: product.cover,
        count: quantity,
        selected: true
      };
      wx.setStorageSync('sneaker_checkout_items', [checkoutItem]);
      const deliveryParam = this.data.deliveryType === 'store_pickup' ? 'PICKUP' : 'DELIVERY';
      const pointParam = this.data.selectedPickupPoint ? (this.data.selectedPickupPoint.id || this.data.selectedPickupPoint._id) : '';
      wx.navigateTo({
        url: `/pages/checkout/index?deliveryType=${deliveryParam}&pickupPointId=${pointParam || ''}`
      });
    }
  },

  onCloseSku() {
    this.setData({ skuPopupVisible: false });
  },

  async onSkuConfirm(e: any) {
    const { actionType, color, size, skuId: emittedSkuId, sku, quantity } = e.detail;
    this.setData({
      selectedColor: color,
      selectedSize: size,
      selectedQuantity: quantity,
      selectedSkuText: `已选: ${color.name} / ${size.size} / ${quantity}件`
    });

    const finalSkuId = emittedSkuId || sku?.skuId || size?.skuId ||
      (this.data.product.skus?.find((s: any) =>
        (s.colorName === color.name || s.colorId === color.id) &&
        Number(s.size) === Number(size.size)
      )?.skuId);
    if (!finalSkuId) {
      wx.showToast({ title: '规格信息已失效，请刷新商品', icon: 'none' });
      return;
    }

    if (actionType === 'cart') {
      CartService.addToCart(finalSkuId, quantity, {
        productId: this.data.product.id,
        title: this.data.product.title,
        skuText: `${color.name} / ${size.size}`,
        price: this.data.product.price,
        image: color.image || this.data.product.cover
      }).then(() => {
        this.setData({ cartCount: this.data.cartCount + quantity });
        wx.showToast({
          title: '已加入购物车',
          icon: 'success',
          duration: 1500
        });
      }).catch((err) => {
        wx.showToast({ title: err.message || '加购失败', icon: 'none' });
      });
    } else {
      // 立即购买：写入待结算条目并前往确认订单页面 (统一执行地址数量判定与真实微信支付全链路)
      const checkoutItem = {
        id: `buy_${Date.now()}`,
        cartId: '',
        skuId: finalSkuId,
        productId: this.data.product.id || (this.data.product as any)._id,
        title: this.data.product.title || (this.data.product as any).name || '商品',
        skuText: `${color.name} / ${size.size}`,
        price: this.data.product.price,
        image: color.image || this.data.product.cover,
        count: quantity,
        selected: true
      };
      wx.setStorageSync('sneaker_checkout_items', [checkoutItem]);
      const deliveryParam = this.data.deliveryType === 'store_pickup' ? 'PICKUP' : 'DELIVERY';
      const pointParam = this.data.selectedPickupPoint ? (this.data.selectedPickupPoint.id || (this.data.selectedPickupPoint as any)._id) : '';
      wx.navigateTo({
        url: `/pages/checkout/index?deliveryType=${deliveryParam}&pickupPointId=${pointParam || ''}`
      });
    }
  },

  async onGoCart() {
    try {
      const items = await CartService.getCart();
      const list = items || [];
      const total = list.reduce((sum, it) => sum + (it.price * it.count), 0);
      const totalCount = list.reduce((sum, it) => sum + it.count, 0);
      this.setData({
        cartItems: list,
        cartCount: totalCount,
        cartTotalAmountYuan: (total / 100).toFixed(2),
        cartPreviewVisible: true
      });
    } catch (e) {
      console.warn('Load cart preview failed, showing empty modal:', e);
      this.setData({
        cartPreviewVisible: true
      });
    }
  },

  onCloseCartPreview() {
    this.setData({ cartPreviewVisible: false });
  },

  onNavigateToCart() {
    this.setData({ cartPreviewVisible: false });
    wx.switchTab({
      url: '/pages/cart/index'
    });
  },

  onStopProp() {
    // 阻止点击内容区域事件冒泡导致关闭弹窗
  },

  onContactService() {
    wx.showModal({
      title: '在线商品顾问',
      content: '专属顾问已在线，正在为您接入...',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onShareAppMessage() {
    return {
      title: `${this.data.product.title} - 通用商城`,
      imageUrl: this.data.product.cover
    };
  }
});
