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
exports.CategoryService = void 0;
const cloud_1 = require("./cloud");
class CategoryService {
    /**
     * 获取首页快捷分类/金刚区
     */
    static getQuickCategories() {
        return __awaiter(this, void 0, void 0, function* () {
            const list = yield (0, cloud_1.callCloud)('products', 'categories', {});
            if (!Array.isArray(list))
                throw new Error('分类响应格式异常');
            return list;
        });
    }
}
exports.CategoryService = CategoryService;
