"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const format_1 = require("../../utils/format");
Component({
    properties: {
        product: {
            type: Object,
            value: {},
            observer: 'onProductChange'
        }
    },
    data: {
        formattedSales: ''
    },
    lifetimes: {
        attached() {
            this.onProductChange();
        }
    },
    methods: {
        onProductChange() {
            const p = this.properties.product;
            if (p && p.sales !== undefined) {
                this.setData({
                    formattedSales: (0, format_1.formatSales)(p.sales)
                });
            }
        },
        onTapCard() {
            const p = this.properties.product;
            if (p && p.id) {
                wx.navigateTo({
                    url: `/pages/goods/detail/index?id=${p.id}`
                });
            }
        }
    }
});
