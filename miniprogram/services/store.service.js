"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoreService = void 0;
const cloud_1 = require("./cloud");
class StoreService {
    static get() { return (0, cloud_1.callCloud)('products', 'storeSettings'); }
}
exports.StoreService = StoreService;
