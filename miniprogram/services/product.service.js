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
exports.ProductService = void 0;
const cloud_1 = require("./cloud");
class ProductService {
    /**
     * 获取首页推荐商品 (猜你喜欢)
     */
    static getRecommendList() {
        return __awaiter(this, arguments, void 0, function* (page = 1, pageSize = 6) {
            return yield (0, cloud_1.callCloud)('products', 'recommend', { page, pageSize });
        });
    }
    /**
     * 获取商品列表 (支持分类筛选、关键字搜索、多维度排序与分页)
     */
    static getList(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (0, cloud_1.callCloud)('products', 'list', params);
        });
    }
    /**
     * 获取单件商品详情 (含多规格 SKU 矩阵)
     */
    static getDetail(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (0, cloud_1.callCloud)('products', 'detail', { id });
        });
    }
}
exports.ProductService = ProductService;
