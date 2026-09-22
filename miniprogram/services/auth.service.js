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
exports.AuthService = void 0;
const cloud_1 = require("./cloud");
const STORAGE_USER_KEY = 'sneaker_mall_user';
class AuthService {
    /**
     * 静默登录 / 自动获取身份 (自动获取/安排头像、昵称并随机分配用户ID)
     */
    static login() {
        return __awaiter(this, arguments, void 0, function* (extraParams = {}) {
            var _a, _b;
            const cached = wx.getStorageSync(STORAGE_USER_KEY);
            const params = {
                nickName: extraParams.nickName || ((_a = cached === null || cached === void 0 ? void 0 : cached.user) === null || _a === void 0 ? void 0 : _a.nickName) || undefined,
                avatarUrl: extraParams.avatarUrl || ((_b = cached === null || cached === void 0 ? void 0 : cached.user) === null || _b === void 0 ? void 0 : _b.avatarUrl) || undefined
            };
            const res = yield (0, cloud_1.callCloud)('auth', 'login', params);
            if (res && res.user) {
                wx.setStorageSync(STORAGE_USER_KEY, res);
            }
            return res;
        });
    }
    /**
     * 自主更新用户头像与昵称
     */
    static updateProfile(profile) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield (0, cloud_1.callCloud)('auth', 'updateProfile', profile);
            const cached = wx.getStorageSync(STORAGE_USER_KEY) || {};
            cached.user = Object.assign(Object.assign({}, (cached.user || {})), (res.user || profile));
            wx.setStorageSync(STORAGE_USER_KEY, cached);
            return cached.user;
        });
    }
    /**
     * 获取当前缓存的用户信息
     */
    static getCurrentUser() {
        try {
            const data = wx.getStorageSync(STORAGE_USER_KEY);
            return (data === null || data === void 0 ? void 0 : data.user) || null;
        }
        catch (_a) {
            return null;
        }
    }
}
exports.AuthService = AuthService;
