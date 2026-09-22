"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const system_1 = require("../../utils/system");
Component({
    properties: {
        title: {
            type: String,
            value: ''
        },
        showBack: {
            type: Boolean,
            value: false
        },
        showLogo: {
            type: Boolean,
            value: false
        },
        logoText: {
            type: String,
            value: '通用商城'
        },
        background: {
            type: String,
            value: '#FFFFFF'
        },
        textColor: {
            type: String,
            value: '#18191B'
        },
        borderBottom: {
            type: Boolean,
            value: false
        }
    },
    data: {
        navInfo: {
            statusBarHeight: 44,
            navBarHeight: 44,
            menuButtonHeight: 32,
            menuButtonTop: 50,
            menuButtonLeft: 281,
            menuButtonRight: 368,
            capsuleTotalWidth: 94,
            totalNavHeight: 88,
            safeAreaBottom: 34,
            windowWidth: 375
        }
    },
    lifetimes: {
        attached() {
            const navInfo = (0, system_1.getSystemNavInfo)();
            this.setData({ navInfo });
        }
    },
    methods: {
        onBack() {
            if (this.properties.showBack) {
                const pages = getCurrentPages();
                if (pages.length > 1) {
                    wx.navigateBack({ delta: 1 });
                }
                else {
                    wx.switchTab({ url: '/pages/home/index' });
                }
            }
            this.triggerEvent('back');
        }
    }
});
