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
exports.AddressService = void 0;
const cloud_1 = require("./cloud");
class AddressService {
    static list() {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('addresses', 'list', {});
        });
    }
    static getDefault() {
        return __awaiter(this, void 0, void 0, function* () {
            const list = yield this.list();
            return list.find(item => item.isDefault) || list[0] || null;
        });
    }
    static save(address) {
        return __awaiter(this, void 0, void 0, function* () {
            return (0, cloud_1.callCloud)('addresses', 'save', address);
        });
    }
    static remove(id) {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, cloud_1.callCloud)('addresses', 'delete', { id });
        });
    }
}
exports.AddressService = AddressService;
