const crypto = require('crypto');
function uuid() {
  return (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
function success(data = null, message = '操作成功') { return { success: true, code: 'OK', message, data, requestId: uuid(), serverTime: Date.now() }; }
function fail(code = 'SYSTEM_ERROR', message = '系统内部错误') {
  const dbUnavailable = /(?:collection|database).*(?:not.?exist|not found|不存在|权限)|(?:not.?exist|not found|不存在).*(?:collection|database)/i.test(String(message || ''));
  if (dbUnavailable) return { success: false, code: 'DB_NOT_READY', message: '云端数据库尚未初始化，请在云开发控制台完成集合配置后重试', data: null, requestId: uuid(), serverTime: Date.now() };
  const safe = typeof code === 'string' && /^[A-Z_]{3,50}$/.test(code) && !['SYSTEM_ERROR', 'CONFIG_ERROR'].includes(code);
  return { success: false, code: safe ? code : 'SYSTEM_ERROR', message: message || '服务暂时不可用，请稍后重试', data: null, requestId: uuid(), serverTime: Date.now() };
}
module.exports = { success, fail };
