/**
 * 生产级微信支付与云开发环境变量严格校验模块
 * 杜绝硬编码默认生产值、占位符与缺失配置静默运行
 */

const PLACEHOLDER_PATTERNS = [
  /^your_/i,
  /^YOUR_/,
  /^test_placeholder/i,
  /你的真实/i,
  /你的微信/i,
  /商户号/i,
  /^0+$/,
  /^12345678$/,
  /^xxxx+$/i,
  /^placeholder/i
];

function isPlaceholder(val) {
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim();
  if (trimmed === '') return true;
  return PLACEHOLDER_PATTERNS.some(p => p.test(trimmed));
}

/**
 * 校验微信支付与核心云环境配置
 * 缺失或占位符时抛出 CONFIG_ERROR 异常阻断执行
 */
function getValidatedWechatPayConfig() {
  const appId = process.env.WECHAT_APP_ID;
  if (!appId || isPlaceholder(appId)) {
    const err = new Error('[CONFIG_ERROR] WECHAT_APP_ID 缺失或仍为占位符，严禁运行！请在环境变量中配置真实 AppID。');
    err.code = 'CONFIG_ERROR';
    throw err;
  }

  // 商户号 (直连商户号或服务商特约商户号)
  const mchId = process.env.WECHAT_PAY_MCH_ID || process.env.WECHAT_PAY_SUB_MCH_ID;
  if (!mchId || isPlaceholder(mchId)) {
    const err = new Error('[CONFIG_ERROR] WECHAT_PAY_MCH_ID 缺失或仍为占位符，严禁运行！请配置真实微信商户号。');
    err.code = 'CONFIG_ERROR';
    throw err;
  }

  // 云环境 ID
  const envId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || process.env.SCF_NAMESPACE;
  if (!envId || isPlaceholder(envId)) {
    const err = new Error('[CONFIG_ERROR] CLOUDBASE_ENV_ID 缺失或仍为占位符，严禁运行！请配置真实云开发环境 ID。');
    err.code = 'CONFIG_ERROR';
    throw err;
  }

  return {
    appId: appId.trim(),
    mchId: mchId.trim(),
    envId: envId.trim()
  };
}

function getWechatPayMerchantId() {
  const merchantId = process.env.WECHAT_PAY_SUB_MCH_ID || process.env.WECHAT_PAY_MCH_ID;
  if (!merchantId || isPlaceholder(merchantId)) {
    const err = new Error('[CONFIG_ERROR] 微信支付商户号缺失或仍为占位符');
    err.code = 'CONFIG_ERROR';
    throw err;
  }
  return merchantId.trim();
}

module.exports = {
  isPlaceholder,
  getValidatedWechatPayConfig,
  getWechatPayMerchantId
};
