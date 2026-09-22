"use strict";
/**
 * 数据与价格格式化工具
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPrice = formatPrice;
exports.formatSales = formatSales;
function formatPrice(price, isCents = true) {
    const rawNum = Number(price) || 0;
    // 数据库所有金额统一为整型分（如 69900 分 = ¥699.00）
    const num = isCents ? rawNum / 100 : rawNum;
    const fixed = num.toFixed(2);
    const [integer, decimal] = fixed.split('.');
    return {
        currency: '¥',
        integer: integer || '0',
        decimal: decimal === '00' ? '' : `.${decimal}`
    };
}
function formatSales(sales = 0) {
    if (sales >= 10000) {
        return `${(sales / 10000).toFixed(1).replace(/\.0$/, '')}万+人已买`;
    }
    return `${sales}人已买`;
}
