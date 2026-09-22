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
exports.BannerService = void 0;
const cloud_1 = require("./cloud");
class BannerService {
    /**
     * 获取首页活动与轮播列表
     */
    static getHomeBanners() {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('products', 'banners', {});
        });
    }
    /**
     * 获取潮流活动专区 4 格展示卡片
     */
    static getPromoCards() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield (0, cloud_1.callCloud)('products', 'promoCards', {});
                return Array.isArray(res) ? res : [];
            }
            catch (_) {
                return [];
            }
        });
    }
}
exports.BannerService = BannerService;
