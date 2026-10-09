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
exports.AdService = void 0;
const cloud_1 = require("./cloud");
class AdService {
    /**
     * 拉取广告位配置与今日剩余次数
     */
    static getAdInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('ads', 'getAdInfo', {});
        });
    }
    /**
     * 上报「已完整观看广告」，服务端事务原子发放额度并校验每日上限
     */
    static reward() {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('ads', 'reward', {});
        });
    }
}
exports.AdService = AdService;
