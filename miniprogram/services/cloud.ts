/**
 * CloudBase 云函数通信适配器与防腐层
 * 统一网络通信、错误拦截、环境自动侦测与支付安全防腐
 */

import { ApiResponse } from '../models/common';

// 微信云开发环境 ID (请在微信开发者工具云开发控制台查看并填入)
export const CLOUD_ENV_ID = 'cloud1-d3gffg6ok96e6cf3f';
const LOCAL_GATEWAY = 'http://127.0.0.1:3001';
const LOCAL_SESSION_KEY = 'sneaker_local_session';

let isCloudInited = false;

export function initCloud() {
  if (isCloudInited) return;
  if (wx.cloud) {
    try {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true
      });
      isCloudInited = true;
      console.log('[CloudBase] wx.cloud initialized with env:', CLOUD_ENV_ID);
    } catch (e) {
      console.warn('[CloudBase] wx.cloud.init warning:', e);
    }
  }
}

/**
 * 本地开发网关调用辅助函数 (直连 127.0.0.1:3001)
 */
async function getLocalSession(): Promise<string> {
  const cached = wx.getStorageSync(LOCAL_SESSION_KEY);
  if (cached) return cached;
  return new Promise((resolve, reject) => wx.request({
    url: `${LOCAL_GATEWAY}/localSession`, method: 'POST', data: {}, timeout: 3000,
    success: (res: any) => {
      const token = res.data?.data?.token;
      if (!token) return reject(new Error('本地测试会话创建失败'));
      wx.setStorageSync(LOCAL_SESSION_KEY, token); resolve(token);
    }, fail: reject
  }));
}

async function callLocalGateway<T>(functionName: string, action: string, params: any): Promise<T> {
  const session = await getLocalSession();
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
      success: (res: any) => {
        if (res.statusCode === 200 && res.data) {
          const body = res.data as ApiResponse<T>;
          if (body.success) {
            resolve(body.data as T);
          } else {
            reject(new Error(body.message || '本地网关业务处理失败'));
          }
        } else {
          reject(new Error(`本地服务网关响应失败: HTTP ${res.statusCode}`));
        }
      },
      fail: (reqErr: any) => reject(reqErr)
    });
  });
}

/**
 * 统一云函数调用门面 (本地开发直连网关，生产环境真实云函数)
 */
export async function callCloud<T>(
  functionName: string,
  action: string,
  params: any = {}
): Promise<T> {
  initCloud();

  const isPlaceholderEnv = !CLOUD_ENV_ID || /your[-_]|placeholder|sneaker-mall-env-id/i.test(CLOUD_ENV_ID);

  // 1. 本地模拟器模式优先尝试直连隔离网关 (127.0.0.1:3001)
  // 当云环境仍为占位符时，立即直连 local-admin-api，避免云端 404011 报错与网络挂起延迟，
  // 确保微信开发者工具与 PC 管理后台的数据毫秒级双向同步
  if (isPlaceholderEnv) {
    try {
      return await callLocalGateway<T>(functionName, action, params);
    } catch (localErr: any) {
      throw new Error(localErr?.message || `本地模拟网关未响应`);
    }
  }

  // 2. 尝试调用微信官方 wx.cloud.callFunction
  if (wx.cloud) {
    try {
      const res = await wx.cloud.callFunction({
        name: functionName,
        config: {
          env: CLOUD_ENV_ID
        },
        data: {
          action,
          params
        }
      });

      if (!res || !res.result) {
        throw new Error('云函数没有返回有效数据');
      }

      const result = res.result as ApiResponse<T>;
      if (result && result.success) {
        return result.data as T;
      } else {
        const errMsg = result ? result.message || '服务器处理失败' : '云函数响应格式异常';
        const e = new Error(errMsg);
        (e as any).code = result?.code || 'BUSINESS_ERROR';
        throw e;
      }
    } catch (err: any) {
      console.error('[PAY-CLOUD-ERROR]', {
        functionName,
        action,
        errMsg: err?.errMsg || err?.message,
        errCode: err?.errCode,
        errno: err?.errno,
        requestID: err?.requestID,
        stack: err?.stack
      });

      if (isPlaceholderEnv) {
        throw new Error(`云开发环境未配置(占位符: ${CLOUD_ENV_ID})，本地模拟网关未响应`);
      }

      const rawMsg = String(err?.errMsg || err?.message || '');
      let friendlyMsg = rawMsg;
      if (rawMsg.includes('-504002') || err?.errCode === -504002) {
        friendlyMsg = `云函数执行超时或服务繁忙 [${functionName}:${action}] (-504002)`;
      } else if (rawMsg.includes('-501000') || err?.errCode === -501000) {
        friendlyMsg = `云开发环境未就绪 (-501000)`;
      } else if (!friendlyMsg) {
        friendlyMsg = `云函数调用异常 [${functionName}:${action}]`;
      }

      const enhancedErr: any = new Error(friendlyMsg);
      enhancedErr.functionName = functionName;
      enhancedErr.action = action;
      enhancedErr.errMsg = err?.errMsg || err?.message;
      enhancedErr.errCode = err?.errCode;
      enhancedErr.errno = err?.errno;
      enhancedErr.requestID = err?.requestID;
      enhancedErr.rawError = err;
      throw enhancedErr;
    }
  }

  throw new Error('当前微信运行环境不支持云开发，请使用微信客户端或打开微信开发者工具');
}

