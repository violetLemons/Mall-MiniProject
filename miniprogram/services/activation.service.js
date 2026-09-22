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
exports.ActivationService = void 0;
const cloud_1 = require("./cloud");
class ActivationService {
    /**
     * 卡密兑换 (调用 activation.redeem，服务端校验并原子认领)
     */
    static redeem(code) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('activation', 'redeem', { code });
        });
    }
}
exports.ActivationService = ActivationService;
