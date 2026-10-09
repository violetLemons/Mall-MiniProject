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
exports.report = report;
exports.requirePrivacy = requirePrivacy;
exports.openPrivacy = openPrivacy;
function report(event, fields = {}) {
    // Register these event names in the WeChat analysis console. Never report buyer identity/address.
    try {
        if (typeof wx.reportEvent === 'function')
            wx.reportEvent(event, fields);
    }
    catch (_) { }
}
function requirePrivacy() {
    return __awaiter(this, void 0, void 0, function* () {
        const api = wx;
        if (typeof api.requirePrivacyAuthorize !== 'function')
            throw new Error('请更新微信版本后使用此功能');
        yield new Promise((resolve, reject) => api.requirePrivacyAuthorize({ success: resolve, fail: () => reject(new Error('请同意隐私保护指引后继续')) }));
    });
}
function openPrivacy() {
    const api = wx;
    if (typeof api.openPrivacyContract === 'function')
        api.openPrivacyContract({ fail: () => wx.showToast({ title: '请在微信后台配置隐私保护指引', icon: 'none' }) });
}
