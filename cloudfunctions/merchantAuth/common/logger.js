/**
 * 生产级安全日志与数据脱敏工具
 * 杜绝明文输出 OpenID、手机号、支付交易单号与安全令牌
 */

function maskOpenId(openid) {
  if (!openid || typeof openid !== 'string') return '***';
  if (openid.length <= 8) return '***';
  return `${openid.slice(0, 4)}****${openid.slice(-4)}`;
}

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '***';
  const clean = phone.trim();
  if (clean.length < 11) return '***';
  return `${clean.slice(0, 3)}****${clean.slice(-4)}`;
}

function maskTransactionId(txId) {
  if (!txId || typeof txId !== 'string') return '***';
  if (txId.length <= 8) return '***';
  return `${txId.slice(0, 6)}****${txId.slice(-4)}`;
}

/**
 * 结构化对象脱敏
 */
function maskSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(clone)) {
    const lk = key.toLowerCase();
    const val = clone[key];

    if (val && typeof val === 'object') {
      clone[key] = maskSensitiveData(val);
    } else if (typeof val === 'string') {
      if (lk.includes('openid')) {
        clone[key] = maskOpenId(val);
      } else if (lk.includes('phone') || lk.includes('mobile')) {
        clone[key] = maskPhone(val);
      } else if (lk.includes('transactionid') || lk.includes('transaction_id')) {
        clone[key] = maskTransactionId(val);
      } else if (lk.includes('token') || lk.includes('secret') || lk.includes('sign')) {
        clone[key] = '******';
      }
    }
  }

  return clone;
}

/**
 * 管理后台操作审计流水记录工具
 */
async function recordOperationLog(db, {
  adminId,
  adminUsername,
  action,
  resourceType,
  resourceId = '',
  before = null,
  after = null,
  ip = '',
  userAgent = ''
}) {
  try {
    await db.collection('operation_logs').add({
      data: {
        adminId,
        adminUsername,
        action,
        resourceType,
        resourceId,
        before: maskSensitiveData(before),
        after: maskSensitiveData(after),
        ip,
        userAgent,
        createdAt: db.serverDate()
      }
    });
  } catch (err) {
    console.error('[LOGGER_ERROR] Failed to write operation log:', err);
  }
}

module.exports = {
  maskOpenId,
  maskPhone,
  maskTransactionId,
  maskSensitiveData,
  recordOperationLog
};
