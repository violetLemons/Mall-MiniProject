"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
Component({
    properties: {
        list: {
            type: Array,
            value: [],
            observer(newVal) {
                this.updateFormattedList(newVal);
            }
        }
    },
    data: {
        formattedList: []
    },
    lifetimes: {
        attached() {
            this.updateFormattedList(this.properties.list);
        }
    },
    methods: {
        updateFormattedList(list) {
            if (!Array.isArray(list))
                return;
            const formatted = list.map(item => {
                const iconStr = typeof item.icon === 'string' ? item.icon.trim() : '';
                const isImageIcon = /^(https?:\/\/|cloud:\/\/|\/|data:image\/(?:png|jpeg|webp|svg\+xml)[;,])/i.test(iconStr);
                return Object.assign(Object.assign({}, item), { id: item.id || item._id, isImageIcon, iconDisplay: !isImageIcon && Array.from(iconStr).length <= 4 ? (iconStr || '👟') : '👟' });
            });
            this.setData({ formattedList: formatted });
        },
        onIconError(e) {
            const index = Number(e.currentTarget.dataset.index);
            if (Number.isInteger(index) && this.data.formattedList[index]) {
                this.setData({ [`formattedList[${index}].isImageIcon`]: false, [`formattedList[${index}].iconDisplay`]: '👟' });
            }
        },
        onSelect(e) {
            const item = e.currentTarget.dataset.item;
            this.triggerEvent('select', { item });
            // 默认直接跳转商品列表页并带上分类ID
            wx.navigateTo({
                url: `/pages/goods/list/index?categoryId=${item.id}&categoryName=${encodeURIComponent(item.name)}`
            });
        }
    }
});
