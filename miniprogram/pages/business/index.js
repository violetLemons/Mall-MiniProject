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
const store_service_1 = require("../../services/store.service");
const compliance_1 = require("../../services/compliance");
Page({
    data: { store: null, error: '', loading: false },
    onLoad() { this.load(); },
    load() {
        return __awaiter(this, void 0, void 0, function* () { this.setData({ loading: true, error: '' }); try {
            this.setData({ store: yield store_service_1.StoreService.get() });
        }
        catch (e) {
            this.setData({ error: e.message || '商家资料加载失败' });
        }
        finally {
            this.setData({ loading: false });
        } });
    },
    onPrivacy() { (0, compliance_1.openPrivacy)(); },
    onCall() { var _a; const phone = (_a = this.data.store) === null || _a === void 0 ? void 0 : _a.customerServicePhone; if (phone)
        wx.makePhoneCall({ phoneNumber: phone }); },
    onPreview() { var _a; const url = (_a = this.data.store) === null || _a === void 0 ? void 0 : _a.businessLicenseUrl; if (url)
        wx.previewImage({ urls: [url], current: url }); }
});
