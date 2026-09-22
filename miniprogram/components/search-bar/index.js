"use strict";
Component({
    properties: {
        placeholder: {
            type: String,
            value: '搜索商品 / 品牌 / 系列'
        },
        value: {
            type: String,
            value: ''
        },
        readonly: {
            type: Boolean,
            value: false
        },
        showMessage: {
            type: Boolean,
            value: false
        },
        hasUnread: {
            type: Boolean,
            value: true
        }
    },
    data: {
        inputValue: ''
    },
    lifetimes: {
        attached() {
            this.setData({ inputValue: this.properties.value });
        }
    },
    methods: {
        onTapBar() {
            if (this.properties.readonly) {
                wx.navigateTo({
                    url: '/pages/goods/list/index'
                });
            }
        },
        onInput(e) {
            this.setData({ inputValue: e.detail.value });
            this.triggerEvent('input', { value: e.detail.value });
        },
        onConfirm(e) {
            this.triggerEvent('confirm', { value: e.detail.value });
        },
        onClear() {
            this.setData({ inputValue: '' });
            this.triggerEvent('clear');
            this.triggerEvent('confirm', { value: '' });
        },
        onMessageTap() {
            wx.showToast({
                title: '暂无未读系统消息',
                icon: 'none'
            });
            this.triggerEvent('message');
        }
    }
});
