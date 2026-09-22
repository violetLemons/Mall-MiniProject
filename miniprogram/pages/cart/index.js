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
const cart_service_1 = require("../../services/cart.service");
const address_service_1 = require("../../services/address.service");
const pickup_service_1 = require("../../services/pickup.service");
Page({
    data: {
        cartItems: [],
        allSelected: true,
        totalPrice: 0,
        selectedCount: 0,
        loading: false,
        deliveryType: 'DELIVERY',
        selectedAddress: null,
        pickupPoints: [],
        selectedPickupPoint: null
    },
    onShow() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadCart();
            yield this.loadCheckoutOptions();
        });
    },
    loadCheckoutOptions() {
        return __awaiter(this, void 0, void 0, function* () {
            const [address, points] = yield Promise.all([
                address_service_1.AddressService.getDefault().catch(() => null),
                pickup_service_1.PickupService.list().catch(() => [])
            ]);
            this.setData({
                selectedAddress: address,
                pickupPoints: points.filter(point => point.status !== 'DISABLED'),
                selectedPickupPoint: points.find(point => point.status !== 'DISABLED') || null
            });
        });
    },
    onSelectDelivery(e) {
        const type = e.currentTarget.dataset.type;
        if (type === 'DELIVERY' || type === 'PICKUP')
            this.setData({ deliveryType: type });
    },
    onSelectPickupPoint(e) {
        const point = this.data.pickupPoints[Number(e.currentTarget.dataset.index)];
        if (point)
            this.setData({ selectedPickupPoint: point });
    },
    onOpenAddress() {
        wx.switchTab({ url: '/pages/profile/index' });
    },
    loadCart() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const items = yield cart_service_1.CartService.getCart();
                const allSelected = items.length > 0 && items.every(i => i.selected);
                this.setData({
                    cartItems: items,
                    allSelected
                }, () => {
                    this.calculateTotal();
                });
            }
            catch (e) {
                console.error('Failed to load cart:', e);
                this.calculateTotal();
            }
        });
    },
    toggleItemSelect(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const index = e.currentTarget.dataset.index;
            const item = this.data.cartItems[index];
            if (item) {
                const nextSelect = !item.selected;
                const key = `cartItems[${index}].selected`;
                this.setData({ [key]: nextSelect }, () => {
                    this.calculateTotal();
                });
                try {
                    yield cart_service_1.CartService.toggleSelect(item.id || item.cartId || '', nextSelect);
                }
                catch (err) {
                    this.setData({ [key]: !nextSelect }, () => this.calculateTotal());
                    wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '更新购物车失败，已恢复', icon: 'none' });
                }
            }
        });
    },
    toggleSelectAll() {
        return __awaiter(this, void 0, void 0, function* () {
            const nextSelect = !this.data.allSelected;
            const previous = this.data.cartItems.map(item => (Object.assign({}, item)));
            const updated = this.data.cartItems.map(item => (Object.assign(Object.assign({}, item), { selected: nextSelect })));
            this.setData({
                cartItems: updated,
                allSelected: nextSelect
            }, () => {
                this.calculateTotal();
            });
            try {
                for (const item of updated) {
                    yield cart_service_1.CartService.toggleSelect(item.id || item.cartId || '', nextSelect);
                }
            }
            catch (err) {
                this.setData({ cartItems: previous }, () => this.calculateTotal());
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '更新购物车失败，已恢复', icon: 'none' });
            }
        });
    },
    onCountMinus(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const index = e.currentTarget.dataset.index;
            const item = this.data.cartItems[index];
            if (item && item.count > 1) {
                const nextCount = item.count - 1;
                const key = `cartItems[${index}].count`;
                this.setData({ [key]: nextCount }, () => {
                    this.calculateTotal();
                });
                try {
                    yield cart_service_1.CartService.updateCount(item.id || item.cartId || '', nextCount);
                }
                catch (err) {
                    this.setData({ [key]: item.count }, () => this.calculateTotal());
                    wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '更新数量失败，已恢复', icon: 'none' });
                }
            }
        });
    },
    onCountPlus(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const index = e.currentTarget.dataset.index;
            const item = this.data.cartItems[index];
            if (item && item.count < 5) {
                const nextCount = item.count + 1;
                const key = `cartItems[${index}].count`;
                this.setData({ [key]: nextCount }, () => {
                    this.calculateTotal();
                });
                try {
                    yield cart_service_1.CartService.updateCount(item.id || item.cartId || '', nextCount);
                }
                catch (err) {
                    this.setData({ [key]: item.count }, () => this.calculateTotal());
                    wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '更新数量失败，已恢复', icon: 'none' });
                }
            }
            else {
                wx.showToast({ title: '单款限购 5 双', icon: 'none' });
            }
        });
    },
    deleteItem(e) {
        const index = e.currentTarget.dataset.index;
        const item = this.data.cartItems[index];
        if (!item)
            return;
        wx.showModal({
            title: '提示',
            content: '确定从购物车删除该商品吗？',
            confirmColor: '#FF5500',
            success: (res) => __awaiter(this, void 0, void 0, function* () {
                if (res.confirm) {
                    const updated = [...this.data.cartItems];
                    updated.splice(index, 1);
                    this.setData({ cartItems: updated }, () => {
                        this.calculateTotal();
                    });
                    try {
                        yield cart_service_1.CartService.removeItem(item.id || item.cartId || '');
                    }
                    catch (err) {
                        const restored = [...this.data.cartItems];
                        restored.splice(Math.min(index, restored.length), 0, item);
                        this.setData({ cartItems: restored }, () => this.calculateTotal());
                        wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '删除失败，已恢复', icon: 'none' });
                    }
                }
            })
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
            }
            else {
                all = false;
            }
        }
        this.setData({
            totalPrice: total,
            selectedCount: count,
            allSelected: all
        });
    },
    onCheckout() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.data.selectedCount === 0) {
                wx.showToast({ title: '请先勾选需要结算的商品', icon: 'none' });
                return;
            }
            const selectedItems = this.data.cartItems.filter(i => i.selected);
            wx.setStorageSync('sneaker_checkout_items', selectedItems);
            wx.navigateTo({ url: '/pages/checkout/index' });
        });
    },
    onGoShopping() {
        wx.switchTab({ url: '/pages/home/index' });
    }
});
