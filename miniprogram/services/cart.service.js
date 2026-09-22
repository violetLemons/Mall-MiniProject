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
exports.CartService = void 0;
const cloud_1 = require("./cloud");
class CartService {
    /**
     * 获取购物车商品列表
     */
    static getCart() {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('cart', 'getCart', {});
        });
    }
    /**
     * 添加商品至购物车
     */
    static addToCart(skuId_1) {
        return __awaiter(this, arguments, void 0, function* (skuId, count = 1, extraSnapshot) {
            return (0, cloud_1.callCloud)('cart', 'addCart', Object.assign({ skuId, count }, extraSnapshot));
        });
    }
    /**
     * 更新购物车项数量
     */
    static updateCount(cartId, count) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('cart', 'updateCount', { cartId, count });
        });
    }
    /**
     * 切换单个勾选状态
     */
    static toggleSelect(cartId, selected) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('cart', 'selectCart', { cartId, selected });
        });
    }
    /**
     * 移除指定购物车项
     */
    static removeItem(cartId) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('cart', 'removeCart', { cartId });
        });
    }
    /**
     * 清理所有已选中的结算商品
     */
    static clearSelected() {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('cart', 'clearSelected', {});
        });
    }
}
exports.CartService = CartService;
