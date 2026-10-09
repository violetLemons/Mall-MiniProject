"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const compliance_1 = require("../../../services/compliance");
const product_service_1 = require("../../../services/product.service");
const cart_service_1 = require("../../../services/cart.service");
Page({
    data: {
        id: '',
        product: {},
        loading: true,
        errorMessage: '',
        currentImageIndex: 0,
        isFavorite: false,
        favoriteAnimating: false,
        cartCount: 0,
        cartPreviewVisible: false,
        cartItems: [],
        cartTotalAmountYuan: '0.00',
        skuPopupVisible: false,
        skuActionType: 'both',
        selectedSkuText: '点击选择 颜色 / 规格',
        selectedColor: null,
        selectedSize: null,
        selectedQuantity: 1,
    },
    onLoad(options) {
        (0, compliance_1.report)('product_view', { product_id: String(options.id || '').slice(0, 100) });
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
        if (this.data.id)
            this.loadDetail(this.data.id);
    },
    loadDetail(id) {
        return __awaiter(this, void 0, void 0, function* () {
            this.setData({ loading: true, errorMessage: '' });
            try {
                const product = yield product_service_1.ProductService.getDetail(id);
                if (product) {
                    const existing = wx.getStorageSync('sneaker_mall_history'), history = Array.isArray(existing) ? existing : [];
                    wx.setStorageSync('sneaker_mall_history', [{ id: product.id, title: product.title, image: product.cover, price: product.price }, ...history.filter((x) => x.id !== product.id)].slice(0, 100));
                    this.setData({
                        product,
                        isFavorite: (wx.getStorageSync('sneaker_mall_favorites') || []).some((x) => x.id === product.id),
                        loading: false
                    });
                }
                else {
                    this.setData({ loading: false, errorMessage: '商品不存在或已下架' });
                }
            }
            catch (err) {
                console.error('Failed to load product detail:', err);
                this.setData({ loading: false, errorMessage: err instanceof Error ? err.message : '云端商品加载失败，请重试' });
            }
        });
    },
    onSwiperChange(e) {
        this.setData({ currentImageIndex: e.detail.current });
    },
    onPreviewImage(e) {
        const current = e.currentTarget.dataset.url;
        const urls = this.data.product.images || [this.data.product.cover];
        wx.previewImage({
            current,
            urls
        });
    },
    onToggleFavorite() {
        const nextState = !this.data.isFavorite, p = this.data.product, id = p.id;
        const existing = wx.getStorageSync('sneaker_mall_favorites'), favorites = Array.isArray(existing) ? existing : [];
        const remaining = favorites.filter((x) => x.id !== id);
        if (nextState)
            remaining.unshift({ id, title: p.title, image: p.cover, price: p.price, skuText: '' });
        wx.setStorageSync('sneaker_mall_favorites', remaining.slice(0, 100));
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
    onOpenSku(e) {
        const type = e.currentTarget.dataset.type || 'both';
        this.directAction(type);
    },
    // 单隐藏默认 SKU：不弹规格面板，直接用商品默认 SKU 加购/下单
    directAction(actionType) {
        const product = this.data.product;
        const sku = (product.skus && product.skus[0]) || null;
        const finalSkuId = (sku === null || sku === void 0 ? void 0 : sku.skuId) || (sku === null || sku === void 0 ? void 0 : sku._id) || (sku === null || sku === void 0 ? void 0 : sku.id) || '';
        if (!finalSkuId) {
            wx.showToast({ title: '商品信息已失效，请刷新', icon: 'none' });
            return;
        }
        const quantity = this.data.selectedQuantity || 1;
        if (actionType === 'cart') {
            cart_service_1.CartService.addToCart(finalSkuId, quantity, {
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
        }
        else {
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
            wx.navigateTo({
                url: '/pages/checkout/index'
            });
        }
    },
    onCloseSku() {
        this.setData({ skuPopupVisible: false });
    },
    onSkuConfirm(e) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const { actionType, color, size, skuId: emittedSkuId, sku, quantity } = e.detail;
            this.setData({
                selectedColor: color,
                selectedSize: size,
                selectedQuantity: quantity,
                selectedSkuText: `已选: ${color.name} / ${size.size} / ${quantity}件`
            });
            const finalSkuId = emittedSkuId || (sku === null || sku === void 0 ? void 0 : sku.skuId) || (size === null || size === void 0 ? void 0 : size.skuId) ||
                ((_b = (_a = this.data.product.skus) === null || _a === void 0 ? void 0 : _a.find((s) => (s.colorName === color.name || s.colorId === color.id) &&
                    Number(s.size) === Number(size.size))) === null || _b === void 0 ? void 0 : _b.skuId);
            if (!finalSkuId) {
                wx.showToast({ title: '规格信息已失效，请刷新商品', icon: 'none' });
                return;
            }
            if (actionType === 'cart') {
                cart_service_1.CartService.addToCart(finalSkuId, quantity, {
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
            }
            else {
                // 立即购买：写入待结算条目并前往确认订单页面 (统一执行地址数量判定与真实微信支付全链路)
                const checkoutItem = {
                    id: `buy_${Date.now()}`,
                    cartId: '',
                    skuId: finalSkuId,
                    productId: this.data.product.id || this.data.product._id,
                    title: this.data.product.title || this.data.product.name || '商品',
                    skuText: `${color.name} / ${size.size}`,
                    price: this.data.product.price,
                    image: color.image || this.data.product.cover,
                    count: quantity,
                    selected: true
                };
                wx.setStorageSync('sneaker_checkout_items', [checkoutItem]);
                wx.navigateTo({
                    url: '/pages/checkout/index'
                });
            }
        });
    },
    onGoCart() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const items = yield cart_service_1.CartService.getCart();
                const list = items || [];
                const total = list.reduce((sum, it) => sum + (it.price * it.count), 0);
                const totalCount = list.reduce((sum, it) => sum + it.count, 0);
                this.setData({
                    cartItems: list,
                    cartCount: totalCount,
                    cartTotalAmountYuan: (total / 100).toFixed(2),
                    cartPreviewVisible: true
                });
            }
            catch (e) {
                console.warn('Load cart preview failed, showing empty modal:', e);
                this.setData({
                    cartPreviewVisible: true
                });
            }
        });
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
    onShareAppMessage() {
        return {
            title: `${this.data.product.title} - 通用商城`,
            imageUrl: this.data.product.cover
        };
    }
});
