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
exports.MerchantService = void 0;
exports.formatYuan = formatYuan;
const cloud_1 = require("./cloud");
const STORAGE_MERCHANT_KEY = 'sneaker_merchant_token';
function formatYuan(cents) {
    const n = Number(cents) || 0;
    return (n / 100).toFixed(2);
}
class MerchantService {
    static getMerchant() {
        try {
            const raw = wx.getStorageSync(STORAGE_MERCHANT_KEY);
            return raw ? JSON.parse(raw) : null;
        }
        catch (_a) {
            return null;
        }
    }
    static saveMerchant(info) {
        wx.setStorageSync(STORAGE_MERCHANT_KEY, JSON.stringify(info));
    }
    static updateStored(patch) {
        const cur = MerchantService.getMerchant();
        if (cur)
            MerchantService.saveMerchant(Object.assign(Object.assign({}, cur), patch));
    }
    static logout() {
        wx.removeStorageSync(STORAGE_MERCHANT_KEY);
    }
    /**
     * 一键登录：用 getPhoneNumber 的 code 换身份，命中则签发同体系 JWT 并落本地。
     */
    static loginByPhone(phoneCode) {
        return __awaiter(this, void 0, void 0, function* () {
            const info = yield (0, cloud_1.callCloud)('merchantAuth', 'merchantLogin', { phoneCode });
            MerchantService.saveMerchant(info);
            return info;
        });
    }
    /**
     * 商户端统一请求：携带 token 复用 admin 云函数；鉴权失效自动清 token。
     */
    static request(functionName_1, action_1) {
        return __awaiter(this, arguments, void 0, function* (functionName, action, params = {}) {
            var _a;
            (0, cloud_1.initCloud)();
            const token = ((_a = MerchantService.getMerchant()) === null || _a === void 0 ? void 0 : _a.token) || '';
            if (!wx.cloud)
                throw new Error('当前微信运行环境不支持云开发');
            let res;
            try {
                res = yield wx.cloud.callFunction({
                    name: functionName,
                    config: { env: cloud_1.CLOUD_ENV_ID },
                    data: { action, params, token }
                });
            }
            catch (e) {
                throw new Error((e === null || e === void 0 ? void 0 : e.errMsg) || (e === null || e === void 0 ? void 0 : e.message) || `云函数调用失败 [${functionName}]`);
            }
            const result = res === null || res === void 0 ? void 0 : res.result;
            if (result && result.success)
                return result.data;
            const code = (result === null || result === void 0 ? void 0 : result.code) || 'BUSINESS_ERROR';
            const err = new Error((result === null || result === void 0 ? void 0 : result.message) || '服务处理失败');
            err.code = code;
            if (code === 'AUTH_REQUIRED' || code === 'ADMIN_REQUIRED')
                MerchantService.logout();
            throw err;
        });
    }
    // ---------------- 商品 ----------------
    static getProducts(params = {}) {
        return this.request('adminProducts', 'list', params);
    }
    static getProduct(id) {
        return this.request('adminProducts', 'get', { id });
    }
    static createProduct(p) {
        return this.request('adminProducts', 'create', p);
    }
    static updateProduct(p) {
        return this.request('adminProducts', 'update', p);
    }
    static updateProductStatus(id, status) {
        return this.request('adminProducts', 'updateStatus', { id, status });
    }
    static deleteProduct(id) {
        return this.request('adminProducts', 'delete', { id });
    }
    static uploadImage(base64, filename) {
        return this.request('adminProducts', 'uploadImage', { base64, filename });
    }
    static getCategories() {
        return this.request('adminCategories', 'list', {});
    }
    // ---------------- 订单 ----------------
    static getOrders(params = {}) {
        return this.request('adminOrders', 'list', params);
    }
    static shipSubOrder(orderId, trackingNo, logisticsCompany) {
        return this.request('adminOrders', 'shipSubOrder', { orderId, trackingNo, logisticsCompany });
    }
    static reviewRefund(orderId, decision) {
        return this.request('adminOrders', 'reviewRefund', { orderId, decision });
    }
    static syncWithWechat(orderId) {
        return this.request('adminOrders', 'syncWithWechat', orderId ? { orderId } : {});
    }
    // ---------------- 库存 ----------------
    static getInventoryLogs(params = {}) {
        return this.request('adminInventory', 'listLogs', params);
    }
    static adjustStock(skuId, targetStock, reason) {
        return this.request('adminInventory', 'adjustStock', { skuId, targetStock, reason });
    }
    // ---------------- 商户资料 ----------------
    static updateProfile(p) {
        return this.request('adminUsers', 'updateProfile', p);
    }
    static setSubMchId(subMchId) {
        return this.request('adminUsers', 'setSubMchId', { subMchId });
    }
}
exports.MerchantService = MerchantService;
