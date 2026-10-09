/**
 * CloudBase HTTP gateway for the browser admin console.
 *
 * The mini program calls cloud functions directly. A normal browser cannot
 * use wx.cloud, so this function validates the HTTP boundary and forwards
 * only the allow-listed admin functions through CloudBase's server SDK.
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const ALLOWED_FUNCTIONS = new Set([
  'activation', 'adminAuth', 'adminBanners', 'adminCategories',
  'adminOrders', 'adminProducts', 'adminUsers', 'testPayment', 'ads'
]);

const configuredOrigins = String(process.env.ADMIN_ALLOWED_ORIGINS || '')
  .split(',').map(value => value.trim()).filter(Boolean);

function originAllowed(origin) {
  if (!origin) return true;
  if (configuredOrigins.length > 0) {
    return configuredOrigins.includes(origin);
  }
  if (process.env.APP_ENV === 'production') return false;
  return /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|https:\/\/([a-z0-9-]+\.)*(tcloudbaseapp\.com|tcloudbase\.com))$/i.test(origin);
}

function json(statusCode, payload, origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Origin'
  };
  if (origin && originAllowed(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'Content-Type, Authorization';
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
  }
  return { statusCode, headers, body: JSON.stringify(payload) };
}

function fail(code, message, statusCode, origin) {
  return json(statusCode, {
    success: false,
    code,
    message,
    data: null,
    requestId: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    serverTime: Date.now()
  }, origin);
}

function getPath(event) {
  const raw = event.path || event.rawPath || event.requestContext?.http?.path || event.requestContext?.path || '';
  const segments = String(raw).split('?')[0].replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  // CloudBase may expose the trigger name as the first path segment
  // (`/adminGateway/adminProducts`) or strip it (`/adminProducts`).
  const triggerIndex = segments.indexOf('adminGateway');
  if (triggerIndex >= 0) segments.splice(0, triggerIndex + 1);
  return segments[0] || '';
}

function parseBody(event) {
  if (!event.body) return {};
  if (typeof event.body === 'object') return event.body;
  try { return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); } catch { throw new Error('INVALID_JSON'); }
}

exports.main = async event => {
  const headers = event.headers || event.header || {};
  const origin = headers.origin || headers.Origin || '';
  if (origin && !originAllowed(origin)) return fail('ORIGIN_DENIED', '来源不允许', 403, origin);
  const method = String(event.httpMethod || event.requestContext?.http?.method || 'POST').toUpperCase();
  if (method === 'OPTIONS') return json(204, null, origin);
  if (getPath(event) === 'health' && method === 'GET') {
    return json(200, { success: true, code: 'OK', data: { status: 'ready', env: cloud.DYNAMIC_CURRENT_ENV, appEnv: process.env.APP_ENV || 'unknown' } }, origin);
  }
  if (method !== 'POST') return fail('METHOD_NOT_ALLOWED', '仅支持POST', 405, origin);

  const functionName = getPath(event);
  if (functionName === 'health') {
    return json(200, { success: true, code: 'OK', data: { status: 'ready', env: cloud.DYNAMIC_CURRENT_ENV, appEnv: process.env.APP_ENV || 'unknown' } }, origin);
  }
  if (!ALLOWED_FUNCTIONS.has(functionName)) return fail('NOT_FOUND', '接口不存在', 404, origin);

  const rawBody = typeof event.body === 'string' ? event.body : JSON.stringify(event.body || {});
  if (Buffer.byteLength(rawBody, 'utf8') > 2 * 1024 * 1024) return fail('PAYLOAD_TOO_LARGE', '请求体过大', 413, origin);

  let body;
  try { body = parseBody(event); } catch { return fail('INVALID_PARAMS', 'JSON格式无效', 400, origin); }
  if (!body || typeof body.action !== 'string' || !body.action.trim()) return fail('INVALID_PARAMS', '请求格式无效', 400, origin);
  const params = body.params || body.data || {};
  if (!params || typeof params !== 'object' || Array.isArray(params)) return fail('INVALID_PARAMS', '请求参数无效', 400, origin);

  try {
    const result = await cloud.callFunction({
      name: functionName,
      data: {
        action: body.action,
        params,
        headers: {
          authorization: headers.authorization || headers.Authorization || ''
        }
      }
    });
    const payload = result && result.result ? result.result : result;
    const status = payload?.success ? 200
      : payload?.code === 'RATE_LIMITED' ? 429
      : ['AUTH_REQUIRED', 'ADMIN_REQUIRED', 'AUTH_FAILED'].includes(payload?.code) ? 401
      : payload?.code === 'DB_NOT_READY' ? 503
      : payload?.code === 'PERMISSION_DENIED' ? 403
      : payload?.code === 'ACTION_NOT_FOUND' ? 404
      : 400;
    return json(status, payload || { success: false, code: 'SYSTEM_ERROR', message: '服务暂时不可用' }, origin);
  } catch (error) {
    console.error('[adminGateway]', error?.code || error?.name || 'ERROR', error?.message || error);
    return fail('SYSTEM_ERROR', error?.message || '服务暂时不可用，请稍后重试', 500, origin);
  }
};
