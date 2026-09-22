"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const system_1 = require("./utils/system");
const auth_service_1 = require("./services/auth.service");
const cloud_1 = require("./services/cloud");
App({
    globalData: {
        themeColor: '#111111'
    },
    onLaunch() {
        // 1. 初始化系统安全区与导航栏高度
        try {
            const navInfo = (0, system_1.getSystemNavInfo)();
            this.globalData.systemNavInfo = navInfo;
            console.log('[通用商城] App launched successfully. NavInfo:', navInfo);
        }
        catch (e) {
            console.error('[通用商城] getSystemNavInfo error:', e);
        }
        // 2. 打开小程序时自动初始化云开发并获取用户头像与昵称，随机安排用户ID
        try {
            (0, cloud_1.initCloud)();
            auth_service_1.AuthService.login().then(res => {
                if (res && res.user) {
                    this.globalData.userInfo = res.user;
                    this.globalData.openid = res.openid;
                    console.log('[通用商城] Auto login & profile initialized:', res.user.nickName, res.user.userNo || res.openid);
                }
            }).catch(err => {
                console.warn('[通用商城] Auto login warning:', err);
            });
        }
        catch (e) {
            console.warn('[通用商城] initCloud warning:', e);
        }
        // 3. 监听版本更新 (防崩溃包裹)
        try {
            if (wx.canIUse('getUpdateManager')) {
                const updateManager = wx.getUpdateManager();
                if (updateManager && typeof updateManager.onCheckForUpdate === 'function') {
                    updateManager.onCheckForUpdate((res) => {
                        if (res && res.hasUpdate) {
                            updateManager.onUpdateReady(() => {
                                wx.showModal({
                                    title: '更新提示',
                                    content: '新版本通用商城已准备就绪，是否重启应用？',
                                    confirmColor: '#FF5500',
                                    success: (modalRes) => {
                                        if (modalRes.confirm) {
                                            updateManager.applyUpdate();
                                        }
                                    }
                                });
                            });
                        }
                    });
                }
            }
        }
        catch (e) {
            console.warn('[通用商城] UpdateManager error:', e);
        }
    },
    onError(msg) {
        console.error('[通用商城 Global Error]:', msg);
    },
    onUnhandledRejection(res) {
        console.warn('[通用商城 Unhandled Promise Rejection]:', res.reason || res);
    }
});
