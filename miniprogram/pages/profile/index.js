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
const auth_service_1 = require("../../services/auth.service");
const order_service_1 = require("../../services/order.service");
const cart_service_1 = require("../../services/cart.service");
const address_service_1 = require("../../services/address.service");
const activation_service_1 = require("../../services/activation.service");
const store_1 = require("../../config/store");
const STORAGE_FAV_KEY = 'sneaker_mall_favorites';
const STORAGE_HISTORY_KEY = 'sneaker_mall_history';
const STORAGE_ADDR_KEY = 'sneaker_mall_addresses';
Page({
    data: {
        userInfo: {
            avatarUrl: '/assets/images/default-avatar.png',
            nickName: '微信用户',
            userId: ''
        },
        orderStats: [
            { key: 'all', label: '全部订单', count: 0 },
            { key: 'unpaid', label: '待付款', count: 0 },
            { key: 'unshipped', label: '待发货', count: 0 },
            { key: 'shipped', label: '待收货', count: 0 },
            { key: 'refund', label: '退款中', count: 0 }
        ],
        menuItems: [
            { id: 'fav', title: '我的收藏', badge: '' },
            { id: 'history', title: '浏览历史', badge: '' },
            { id: 'address', title: '收货地址管理', badge: '' },
            { id: 'service', title: '官方在线客服', badge: '9:00-22:00' },
            { id: 'setting', title: '通用设置', badge: '' }
        ],
        customerServicePhone: store_1.STORE_CONFIG.customerServicePhone || '400-000-0000',
        // 抽屉状态
        activeDrawer: null,
        drawerTitle: '',
        // 订单抽屉
        orderActiveTab: 'ALL',
        allOrders: [],
        filteredOrders: [],
        // 优惠券抽屉（营销接口接通前不注入虚构优惠券）
        couponActiveTab: 'available',
        availableCoupons: [],
        expiredCoupons: [],
        // 收藏夹
        favoriteList: [],
        // 浏览足迹
        historyList: [],
        // 收货地址
        addresses: [],
        showAddressForm: false,
        addressRegionValue: ['福建省', '示例市', '示例区'],
        addressForm: {
            name: '',
            phone: '',
            region: '',
            detail: '',
            tag: '学校',
            isDefault: false
        },
        // 系统设置
        storageSize: '128 KB',
        notifyEnabled: true,
        // 激活卡密抽屉
        actCode: '',
        actLoading: false,
        actResult: null
    },
    onShow() {
        this.initLocalData();
        this.syncUserData().catch(() => { });
    },
    initLocalData() {
        // 1. 恢复用户实际操作产生的本地收藏，不注入演示商品
        let favs = wx.getStorageSync(STORAGE_FAV_KEY);
        if (!Array.isArray(favs))
            favs = [];
        this.setData({
            favoriteList: favs,
            'menuItems[0].badge': `${favs.length}件`
        });
        // 2. 恢复用户实际产生的浏览足迹
        let history = wx.getStorageSync(STORAGE_HISTORY_KEY);
        if (!Array.isArray(history))
            history = [];
        this.setData({
            historyList: history,
            'menuItems[1].badge': `${history.length}款`
        });
        // 3. 地址以云端为准；缓存只用于网络失败时展示最近一次结果
        const addrs = wx.getStorageSync(STORAGE_ADDR_KEY);
        this.setData({ addresses: Array.isArray(addrs) ? addrs : [] });
    },
    syncUserData() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const authRes = yield auth_service_1.AuthService.login().catch(() => null);
                if (authRes && authRes.user) {
                    const u = authRes.user;
                    const displayUserId = u.userNo ? `UID: ${u.userNo}` : (authRes.openid ? `UID: ${authRes.openid.slice(-8)}` : '');
                    this.setData({
                        'userInfo.nickName': u.nickName || '商城用户',
                        'userInfo.avatarUrl': u.avatarUrl || this.data.userInfo.avatarUrl,
                        'userInfo.userId': displayUserId
                    });
                }
                const ordersRes = yield order_service_1.OrderService.getList({ page: 1, pageSize: 20 }).catch(() => ({ list: [] }));
                const rawList = ordersRes.list || [];
                const list = rawList.map(o => (Object.assign(Object.assign({}, o), { payAmountYuan: (Number(o.payAmount || 0) / 100).toFixed(2), items: (o.items || []).map(i => (Object.assign(Object.assign({}, i), { unitPriceYuan: (Number(i.unitPrice || 0) / 100).toFixed(2) }))) })));
                const unpaidCount = list.filter(o => o.status === 'PENDING_PAYMENT').length;
                const unshippedCount = list.filter(o => o.status === 'PAID').length;
                const shippedCount = list.filter(o => o.status === 'SHIPPED' || o.status === 'WAITING_PICKUP' || o.status === 'READY_FOR_PICKUP').length;
                const refundCount = list.filter(o => o.status === 'REFUND_PENDING' || o.status === 'REFUNDING').length;
                this.setData({
                    allOrders: list,
                    'orderStats[0].count': list.length, // 全部订单
                    'orderStats[1].count': unpaidCount,
                    'orderStats[2].count': unshippedCount,
                    'orderStats[3].count': shippedCount,
                    'orderStats[4].count': refundCount
                });
                // 如果当前订单抽屉已打开，同步刷新过滤列表
                if (this.data.activeDrawer === 'order') {
                    this.filterOrdersByTab(this.data.orderActiveTab);
                }
                try {
                    const cloudAddresses = yield address_service_1.AddressService.list();
                    const addresses = (cloudAddresses || []).map(item => this.fromCloudAddress(item));
                    wx.setStorageSync(STORAGE_ADDR_KEY, addresses);
                    this.setData({ addresses });
                }
                catch (addrErr) {
                    console.warn('[syncUserData] list addresses failed:', addrErr);
                }
            }
            catch (e) {
                console.warn('Sync profile error:', e);
            }
        });
    },
    // -------------------------
    // 头部用户信息交互
    // -------------------------
    onTapAvatar() {
        wx.showActionSheet({
            itemList: ['查看头像大图', '更换头像'],
            success: (res) => {
                if (res.tapIndex === 0) {
                    wx.previewImage({
                        urls: [this.data.userInfo.avatarUrl],
                        current: this.data.userInfo.avatarUrl
                    });
                }
                else if (res.tapIndex === 1) {
                    wx.chooseMedia({
                        count: 1,
                        mediaType: ['image'],
                        success: (chooseRes) => __awaiter(this, void 0, void 0, function* () {
                            var _a;
                            const tempFilePath = (_a = chooseRes.tempFiles[0]) === null || _a === void 0 ? void 0 : _a.tempFilePath;
                            if (tempFilePath) {
                                this.setData({ 'userInfo.avatarUrl': tempFilePath });
                                try {
                                    yield auth_service_1.AuthService.updateProfile({ avatarUrl: tempFilePath });
                                    wx.showToast({ title: '头像已更新', icon: 'success' });
                                }
                                catch (_b) {
                                    wx.showToast({ title: '头像已保存在本地', icon: 'none' });
                                }
                            }
                        })
                    });
                }
            }
        });
    },
    onEditNickname() {
        wx.showModal({
            title: '修改昵称',
            editable: true,
            placeholderText: '请输入新的昵称',
            content: this.data.userInfo.nickName,
            success: (res) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if (res.confirm && ((_a = res.content) === null || _a === void 0 ? void 0 : _a.trim())) {
                    const newName = res.content.trim();
                    this.setData({ 'userInfo.nickName': newName });
                    try {
                        yield auth_service_1.AuthService.updateProfile({ nickName: newName });
                        wx.showToast({ title: '昵称修改成功', icon: 'success' });
                    }
                    catch (_b) {
                        wx.showToast({ title: '昵称已保存在本地', icon: 'none' });
                    }
                }
            })
        });
    },
    onCopyUid() {
        const uid = this.data.userInfo.userId;
        if (!uid) {
            wx.showToast({ title: '登录后可复制用户标识', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: uid,
            success: () => {
                wx.showToast({ title: 'UID 已复制', icon: 'success' });
            }
        });
    },
    // -------------------------
    // 订单模块交互
    // -------------------------
    onTapOrder(e) {
        const rawKey = e.currentTarget.dataset.key;
        let targetTab = 'ALL';
        if (rawKey === 'unpaid')
            targetTab = 'PENDING_PAYMENT';
        else if (rawKey === 'unshipped')
            targetTab = 'PAID';
        else if (rawKey === 'shipped')
            targetTab = 'SHIPPED';
        else if (rawKey === 'refund')
            targetTab = 'REFUND';
        wx.navigateTo({ url: `/pages/order/list/index${targetTab === 'ALL' ? '' : `?status=${targetTab}`}` });
    },
    onSelectOrderTab(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ orderActiveTab: tab });
        this.filterOrdersByTab(tab);
    },
    onTapActivation() {
        this.setData({
            activeDrawer: 'activation',
            drawerTitle: '激活卡密',
            actCode: '',
            actResult: null
        });
    },
    onActCodeInput(e) {
        this.setData({ actCode: e.detail.value });
    },
    onActRedeem() {
        return __awaiter(this, void 0, void 0, function* () {
            const code = String(this.data.actCode || '').trim();
            if (!code) {
                wx.showToast({ title: '请输入卡密', icon: 'none' });
                return;
            }
            this.setData({ actLoading: true, actResult: null });
            try {
                const res = yield activation_service_1.ActivationService.redeem(code);
                this.setData({
                    actResult: {
                        success: true,
                        message: '兑换成功',
                        benefit: res.benefit,
                        type: res.type,
                        value: res.value
                    }
                });
                wx.showToast({ title: '兑换成功', icon: 'success' });
            }
            catch (err) {
                this.setData({
                    actResult: {
                        success: false,
                        message: (err === null || err === void 0 ? void 0 : err.message) || '兑换失败，请稍后重试'
                    }
                });
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '兑换失败', icon: 'none' });
            }
            finally {
                this.setData({ actLoading: false });
            }
        });
    },
    filterOrdersByTab(tab) {
        const list = this.data.allOrders;
        let filtered = [...list];
        if (tab === 'PENDING_PAYMENT') {
            filtered = list.filter(o => o.status === 'PENDING_PAYMENT');
        }
        else if (tab === 'PAID') {
            filtered = list.filter(o => o.status === 'PAID');
        }
        else if (tab === 'SHIPPED') {
            filtered = list.filter(o => o.status === 'SHIPPED' || o.status === 'WAITING_PICKUP' || o.status === 'READY_FOR_PICKUP');
        }
        else if (tab === 'REFUND') {
            filtered = list.filter(o => o.status === 'CANCELLED' || o.status === 'REFUNDING' || o.status === 'REFUNDED');
        }
        this.setData({ filteredOrders: filtered });
    },
    onPayOrder(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const orderId = e.currentTarget.dataset.id;
            wx.showLoading({ title: '调起支付中...' });
            try {
                const payRes = yield order_service_1.OrderService.payOrder(orderId);
                wx.hideLoading();
                if (payRes && payRes.status === 'PAID') {
                    wx.showToast({ title: '支付成功！', icon: 'success' });
                }
                else {
                    wx.showToast({ title: (payRes === null || payRes === void 0 ? void 0 : payRes.message) || '支付处理中，请稍后刷新', icon: 'none' });
                }
                yield this.syncUserData();
            }
            catch (err) {
                wx.hideLoading();
                wx.showToast({ title: err.message || '支付未完成', icon: 'none' });
            }
        });
    },
    onCancelOrder(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const orderId = e.currentTarget.dataset.id;
            wx.showModal({
                title: '提示',
                content: '确认取消该订单？',
                confirmColor: '#FF5500',
                success: (res) => __awaiter(this, void 0, void 0, function* () {
                    if (res.confirm) {
                        yield order_service_1.OrderService.cancelOrder(orderId);
                        wx.showToast({ title: '订单已取消', icon: 'none' });
                        yield this.syncUserData();
                    }
                })
            });
        });
    },
    onConfirmReceive(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const orderId = e.currentTarget.dataset.id;
            wx.showModal({
                title: '确认收货',
                content: '确认已收到商品且品质完好？',
                confirmColor: '#111111',
                success: (res) => __awaiter(this, void 0, void 0, function* () {
                    if (res.confirm) {
                        yield order_service_1.OrderService.confirmReceive(orderId);
                        wx.showToast({ title: '收货完成！', icon: 'success' });
                        yield this.syncUserData();
                    }
                })
            });
        });
    },
    onViewTracking(e) {
        const trackingNo = String(e.currentTarget.dataset.no || '').trim();
        if (!trackingNo) {
            wx.showToast({ title: '物流单号尚未生成，请刷新订单', icon: 'none' });
            return;
        }
        wx.showModal({
            title: '🚚 物流轨迹跟踪',
            content: `运单号：${trackingNo}\n\n物流轨迹请以承运方官方查询结果为准。`,
            showCancel: false,
            confirmText: '确定'
        });
    },
    onRemindShipping() {
        wx.showToast({ title: '提醒功能暂未开放', icon: 'none' });
    },
    onRebuy(e) {
        const productId = String(e.currentTarget.dataset.pid || '').trim();
        if (!productId) {
            wx.showToast({ title: '商品信息已失效，无法再次购买', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: `/pages/goods/detail/index?id=${productId}` });
    },
    // -------------------------
    // 菜单项目交互
    // -------------------------
    onTapMenu(e) {
        const id = e.currentTarget.dataset.id;
        if (id === 'coupon') {
            wx.showToast({ title: '优惠券功能暂未开放', icon: 'none' });
        }
        else if (id === 'fav') {
            this.setData({
                activeDrawer: 'fav',
                drawerTitle: '我的收藏'
            });
        }
        else if (id === 'history') {
            this.setData({
                activeDrawer: 'history',
                drawerTitle: '浏览历史'
            });
        }
        else if (id === 'address') {
            this.setData({
                activeDrawer: 'address',
                drawerTitle: '收货地址管理',
                showAddressForm: false
            });
        }
        else if (id === 'service') {
            this.setData({
                activeDrawer: 'service',
                drawerTitle: '官方在线客服'
            });
        }
        else if (id === 'setting') {
            const info = wx.getStorageInfoSync ? wx.getStorageInfoSync() : { currentSize: 128 };
            const currentKb = info.currentSize || 128;
            this.setData({
                activeDrawer: 'setting',
                drawerTitle: '通用设置',
                storageSize: currentKb > 1024 ? `${(currentKb / 1024).toFixed(1)} MB` : `${currentKb} KB`
            });
        }
    },
    closeDrawer() {
        this.setData({
            activeDrawer: null,
            showAddressForm: false
        });
    },
    // -------------------------
    // 优惠券交互
    // -------------------------
    onSelectCouponTab(e) {
        const tab = e.currentTarget.dataset.tab;
        this.setData({ couponActiveTab: tab });
    },
    onUseCoupon() {
        this.closeDrawer();
        wx.switchTab({ url: '/pages/category/index' });
    },
    // -------------------------
    // 收藏交互
    // -------------------------
    onAddToCartFromFav(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const item = e.currentTarget.dataset.item;
            try {
                yield cart_service_1.CartService.addToCart(`sku_${item.id}_42`, 1, {
                    productId: item.id,
                    title: item.title,
                    price: item.price,
                    image: item.cover,
                    skuText: '经典规格'
                });
                wx.showToast({ title: '已加入购物车', icon: 'success' });
            }
            catch (err) {
                wx.showToast({ title: '加购失败', icon: 'none' });
            }
        });
    },
    onRemoveFav(e) {
        const id = e.currentTarget.dataset.id;
        const favs = this.data.favoriteList.filter(it => it.id !== id);
        this.setData({
            favoriteList: favs,
            'menuItems[0].badge': `${favs.length}件`
        });
        wx.setStorageSync(STORAGE_FAV_KEY, favs);
        wx.showToast({ title: '已取消收藏', icon: 'none' });
    },
    onGoGoodsDetail(e) {
        const id = e.currentTarget.dataset.id;
        this.closeDrawer();
        wx.navigateTo({ url: `/pages/goods/detail/index?id=${id}` });
    },
    // -------------------------
    // 浏览历史交互
    // -------------------------
    onClearHistory() {
        wx.showModal({
            title: '清空确认',
            content: '确定要清空所有足迹记录吗？',
            confirmColor: '#FF5500',
            success: (res) => {
                if (res.confirm) {
                    this.setData({
                        historyList: [],
                        'menuItems[1].badge': ''
                    });
                    wx.removeStorageSync(STORAGE_HISTORY_KEY);
                    wx.showToast({ title: '足迹已清空', icon: 'success' });
                }
            }
        });
    },
    // -------------------------
    // 收货地址交互
    // -------------------------
    fromCloudAddress(item) {
        return {
            id: item.id || (item === null || item === void 0 ? void 0 : item._id) || '',
            name: item.name,
            phone: item.phone,
            region: [item.province, item.city, item.district].filter(Boolean).join(' '),
            detail: item.detail,
            tag: '',
            isDefault: Boolean(item.isDefault)
        };
    },
    toCloudAddress(item, isDefault = item.isDefault) {
        const region = String(item.region || '').trim();
        const parts = region.split(/\s+/).filter(Boolean);
        return {
            id: item.id ? String(item.id).trim() : undefined,
            name: String(item.name || '').trim(),
            phone: String(item.phone || '').trim(),
            province: parts[0] || '',
            city: parts[1] || '',
            district: parts.slice(2).join(' ') || '',
            detail: String(item.detail || '').trim(),
            isDefault: Boolean(isDefault)
        };
    },
    onSetDefaultAddress(e) {
        return __awaiter(this, void 0, void 0, function* () {
            const id = e.currentTarget.dataset.id;
            const current = this.data.addresses.find(a => a.id === id);
            if (!current)
                return;
            try {
                yield address_service_1.AddressService.save(this.toCloudAddress(current, true));
                yield this.syncUserData();
                wx.showToast({ title: '已设为默认地址', icon: 'success' });
            }
            catch (err) {
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '设置失败，请重试', icon: 'none' });
            }
        });
    },
    onDeleteAddress(e) {
        const id = e.currentTarget.dataset.id;
        wx.showModal({
            title: '删除地址',
            content: '确定删除该收货地址？',
            confirmColor: '#FF5500',
            success: (res) => __awaiter(this, void 0, void 0, function* () {
                if (res.confirm) {
                    try {
                        yield address_service_1.AddressService.remove(id);
                        const addrs = this.data.addresses.filter(a => a.id !== id);
                        this.setData({ addresses: addrs });
                        wx.setStorageSync(STORAGE_ADDR_KEY, addrs);
                        wx.showToast({ title: '地址已删除', icon: 'none' });
                    }
                    catch (err) {
                        wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '删除失败，请重试', icon: 'none' });
                    }
                }
            })
        });
    },
    onOpenAddAddress() {
        this.setData({
            showAddressForm: true,
            addressForm: {
                name: '',
                phone: '',
                region: '',
                detail: '',
                tag: '学校',
                isDefault: false
            }
        });
    },
    onCancelAddressForm() {
        this.setData({ showAddressForm: false });
    },
    onAddressInput(e) {
        const field = e.currentTarget.dataset.field;
        const value = e.detail.value;
        this.setData({
            [`addressForm.${field}`]: value
        });
    },
    onRegionChange(e) {
        const value = e.detail.value;
        const regionStr = Array.isArray(value) ? value.join(' ') : String(value);
        this.setData({
            'addressForm.region': regionStr,
            addressRegionValue: value
        });
    },
    onSelectAddressTag(e) {
        const tag = e.currentTarget.dataset.tag;
        this.setData({
            'addressForm.tag': tag
        });
    },
    onSaveAddress() {
        return __awaiter(this, void 0, void 0, function* () {
            const form = this.data.addressForm || {};
            const receiverName = String(form.name || '').trim();
            const phone = String(form.phone || '').trim();
            const detail = String(form.detail || '').trim();
            let regionStr = String(form.region || '').trim();
            if (!receiverName) {
                wx.showToast({ title: '请填写收件人姓名', icon: 'none' });
                return;
            }
            if (!/^1[3-9]\d{9}$/.test(phone)) {
                wx.showToast({ title: '请填写有效手机号', icon: 'none' });
                return;
            }
            if (!regionStr) {
                wx.showToast({ title: '请选择所在省市区', icon: 'none' });
                return;
            }
            // 智能解析与规范化省市区
            let regionParts = regionStr.split(/\s+/).filter(Boolean);
            if (regionParts.length < 3) {
                const match = regionStr.match(/^(.+?(?:省|自治区|特别行政区|市))(.+?(?:市|自治州|地区|盟|区|县))(.+?(?:区|县|市|旗|镇|街道)?)$/);
                if (match) {
                    regionParts = [match[1], match[2], match[3]].filter(Boolean);
                    regionStr = regionParts.join(' ');
                }
                else if (regionStr.length >= 6) {
                    regionParts = [regionStr, '', ''];
                }
                else {
                    wx.showToast({ title: '请填写或选择完整的省、市、区', icon: 'none' });
                    return;
                }
            }
            if (!detail) {
                wx.showToast({ title: '请填写详细地址', icon: 'none' });
                return;
            }
            const newAddr = {
                id: '',
                name: receiverName,
                phone,
                region: regionStr,
                detail,
                tag: String(form.tag || '').trim(),
                isDefault: this.data.addresses.length === 0
            };
            try {
                const saved = yield address_service_1.AddressService.save(this.toCloudAddress(newAddr, newAddr.isDefault));
                const cloudAddress = this.fromCloudAddress(saved);
                const updated = [cloudAddress, ...this.data.addresses];
                this.setData({ addresses: updated, showAddressForm: false });
                wx.setStorageSync(STORAGE_ADDR_KEY, updated);
                wx.showToast({ title: '地址添加成功！', icon: 'success' });
            }
            catch (err) {
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '保存失败，请重试', icon: 'none' });
            }
        });
    },
    // -------------------------
    // 客服交互
    // -------------------------
    onContactService() {
        wx.makePhoneCall({
            phoneNumber: this.data.customerServicePhone || '400-000-0000',
            fail: () => {
                wx.showToast({ title: '已取消拨打', icon: 'none' });
            }
        });
    },
    onCallHotline() {
        wx.makePhoneCall({
            phoneNumber: this.data.customerServicePhone || '400-000-0000',
            fail: () => {
                wx.showToast({ title: '已取消拨打', icon: 'none' });
            }
        });
    },
    // -------------------------
    // 系统设置交互
    // -------------------------
    onClearCache() {
        wx.showLoading({ title: '清理缓存中...' });
        setTimeout(() => {
            // 保留当前登录身份；订单、库存和支付状态始终从云端读取
            const user = wx.getStorageSync('sneaker_mall_user');
            wx.clearStorageSync();
            if (user)
                wx.setStorageSync('sneaker_mall_user', user);
            wx.hideLoading();
            this.setData({ storageSize: '0 KB' });
            wx.showToast({ title: '缓存已成功清理', icon: 'success' });
        }, 400);
    },
    onToggleNotify(e) {
        const val = e.detail.value;
        this.setData({ notifyEnabled: val });
        wx.showToast({
            title: val ? '已开启消息推送' : '已关闭消息推送',
            icon: 'none'
        });
    },
    onLogout() {
        wx.showModal({
            title: '提示',
            content: '确定要退出当前登录账号吗？',
            confirmColor: '#FF5500',
            success: (res) => {
                if (res.confirm) {
                    wx.showToast({ title: '已退出登录', icon: 'none' });
                    this.closeDrawer();
                }
            }
        });
    }
});
