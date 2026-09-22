"use strict";
/**
 * CloudBase 云函数通信适配器与防腐层
 * 统一网络通信、错误拦截、环境自动侦测与支付安全防腐
 */
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
exports.CLOUD_ENV_ID = void 0;
exports.initCloud = initCloud;
exports.callCloud = callCloud;
// 微信云开发环境 ID (请在微信开发者工具云开发控制台查看并填入)
exports.CLOUD_ENV_ID = 'cloud1-d3gffg6ok96e6cf3f';
const LOCAL_GATEWAY = 'http://127.0.0.1:3001';
const LOCAL_SESSION_KEY = 'sneaker_local_session';
let isCloudInited = false;
function initCloud() {
    if (isCloudInited)
        return;
    if (wx.cloud) {
        try {
            wx.cloud.init({
                env: exports.CLOUD_ENV_ID,
                traceUser: true
            });
            isCloudInited = true;
            console.log('[CloudBase] wx.cloud initialized with env:', exports.CLOUD_ENV_ID);
        }
        catch (e) {
            console.warn('[CloudBase] wx.cloud.init warning:', e);
        }
    }
}
/**
 * 本地开发网关调用辅助函数 (直连 127.0.0.1:3001)
 */
function getLocalSession() {
    return __awaiter(this, void 0, void 0, function* () {
        const cached = wx.getStorageSync(LOCAL_SESSION_KEY);
        if (cached)
            return cached;
        return new Promise((resolve, reject) => wx.request({
            url: `${LOCAL_GATEWAY}/localSession`, method: 'POST', data: {}, timeout: 3000,
            success: (res) => {
                var _a, _b;
                const token = (_b = (_a = res.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.token;
                if (!token)
                    return reject(new Error('本地测试会话创建失败'));
                wx.setStorageSync(LOCAL_SESSION_KEY, token);
                resolve(token);
            }, fail: reject
        }));
    });
}
function callLocalGateway(functionName, action, params) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = yield getLocalSession();
        return new Promise((resolve, reject) => {
            if (typeof wx === 'undefined' || !wx.request) {
                return reject(new Error('wx.request is not available'));
            }
            wx.request({
                url: `${LOCAL_GATEWAY}/${functionName}`,
                method: 'POST',
                header: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session}`
                },
                data: {
                    action,
                    params
                },
                timeout: 2000,
                success: (res) => {
                    if (res.statusCode === 200 && res.data) {
                        const body = res.data;
                        if (body.success) {
                            resolve(body.data);
                        }
                        else {
                            reject(new Error(body.message || '本地网关业务处理失败'));
                        }
                    }
                    else {
                        reject(new Error(`本地服务网关响应失败: HTTP ${res.statusCode}`));
                    }
                },
                fail: (reqErr) => reject(reqErr)
            });
        });
    });
}
/**
 * 统一云函数调用门面 (本地开发直连网关，生产环境真实云函数)
 */
function callCloud(functionName_1, action_1) {
    return __awaiter(this, arguments, void 0, function* (functionName, action, params = {}) {
        initCloud();
        const isPlaceholderEnv = !exports.CLOUD_ENV_ID || /your[-_]|placeholder|sneaker-mall-env-id/i.test(exports.CLOUD_ENV_ID);
        // 1. 本地模拟器模式优先尝试直连隔离网关 (127.0.0.1:3001)
        // 当云环境仍为占位符时，立即直连 local-admin-api，避免云端 404011 报错与网络挂起延迟，
        // 确保微信开发者工具与 PC 管理后台的数据毫秒级双向同步
        if (isPlaceholderEnv) {
            try {
                return yield callLocalGateway(functionName, action, params);
            }
            catch (localErr) {
                throw new Error((localErr === null || localErr === void 0 ? void 0 : localErr.message) || `本地模拟网关未响应`);
            }
        }
        // 2. 尝试调用微信官方 wx.cloud.callFunction
        if (wx.cloud) {
            try {
                const res = yield wx.cloud.callFunction({
                    name: functionName,
                    config: {
                        env: exports.CLOUD_ENV_ID
                    },
                    data: {
                        action,
                        params
                    }
                });
                if (!res || !res.result) {
                    throw new Error('云函数没有返回有效数据');
                }
                const result = res.result;
                if (result && result.success) {
                    return result.data;
                }
                else {
                    const errMsg = result ? result.message || '服务器处理失败' : '云函数响应格式异常';
                    const e = new Error(errMsg);
                    e.code = (result === null || result === void 0 ? void 0 : result.code) || 'BUSINESS_ERROR';
                    throw e;
                }
            }
            catch (err) {
                console.error('[PAY-CLOUD-ERROR]', {
                    functionName,
                    action,
                    errMsg: (err === null || err === void 0 ? void 0 : err.errMsg) || (err === null || err === void 0 ? void 0 : err.message),
                    errCode: err === null || err === void 0 ? void 0 : err.errCode,
                    errno: err === null || err === void 0 ? void 0 : err.errno,
                    requestID: err === null || err === void 0 ? void 0 : err.requestID,
                    stack: err === null || err === void 0 ? void 0 : err.stack
                });
                if (isPlaceholderEnv) {
                    throw new Error(`云开发环境未配置(占位符: ${exports.CLOUD_ENV_ID})，本地模拟网关未响应`);
                }
                const rawMsg = String((err === null || err === void 0 ? void 0 : err.errMsg) || (err === null || err === void 0 ? void 0 : err.message) || '');
                let friendlyMsg = rawMsg;
                if (rawMsg.includes('-504002') || (err === null || err === void 0 ? void 0 : err.errCode) === -504002) {
                    friendlyMsg = `云函数执行超时或服务繁忙 [${functionName}:${action}] (-504002)`;
                }
                else if (rawMsg.includes('-501000') || (err === null || err === void 0 ? void 0 : err.errCode) === -501000) {
                    friendlyMsg = `云开发环境未就绪 (-501000)`;
                }
                else if (!friendlyMsg) {
                    friendlyMsg = `云函数调用异常 [${functionName}:${action}]`;
                }
                const enhancedErr = new Error(friendlyMsg);
                enhancedErr.functionName = functionName;
                enhancedErr.action = action;
                enhancedErr.errMsg = (err === null || err === void 0 ? void 0 : err.errMsg) || (err === null || err === void 0 ? void 0 : err.message);
                enhancedErr.errCode = err === null || err === void 0 ? void 0 : err.errCode;
                enhancedErr.errno = err === null || err === void 0 ? void 0 : err.errno;
                enhancedErr.requestID = err === null || err === void 0 ? void 0 : err.requestID;
                enhancedErr.rawError = err;
                throw enhancedErr;
            }
        }
        throw new Error('当前微信运行环境不支持云开发，请使用微信客户端或打开微信开发者工具');
    });
}
