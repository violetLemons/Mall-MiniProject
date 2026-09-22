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
const activation_service_1 = require("../../services/activation.service");
Page({
    data: {
        code: '',
        loading: false,
        result: null
    },
    onCodeInput(e) {
        this.setData({ code: e.detail.value });
    },
    onRedeem() {
        return __awaiter(this, void 0, void 0, function* () {
            const code = String(this.data.code || '').trim();
            if (!code) {
                wx.showToast({ title: '请输入卡密', icon: 'none' });
                return;
            }
            this.setData({ loading: true, result: null });
            try {
                const res = yield activation_service_1.ActivationService.redeem(code);
                this.setData({
                    result: {
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
                    result: {
                        success: false,
                        message: (err === null || err === void 0 ? void 0 : err.message) || '兑换失败，请稍后重试'
                    }
                });
                wx.showToast({ title: (err === null || err === void 0 ? void 0 : err.message) || '兑换失败', icon: 'none' });
            }
            finally {
                this.setData({ loading: false });
            }
        });
    }
});
