/**
 * 微信支付官方 APIv3 直连模块
 * 专用于绕过实物电商类目的云调用绑定限制 (268500896)
 * 无需在微信云开发控制台绑定商户号，使用企业专有商户证书与私钥进行 RSA-SHA256 签名直接请求
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const DEFAULT_MCH_ID = 'YOUR_WECHAT_PAY_MCH_ID';
const DEFAULT_APP_ID = 'wxYOUR_MINIPROGRAM_APPID';

function normalizePrivateKey(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';

  // 1. 去除外层单/双引号
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }

  // 2. 将字面量 \n 或 \r\n 转换为真实换行符
  if (s.includes('\\n')) {
    s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  }

  // 3. 统一 Windows CRLF 换行
  s = s.replace(/\r\n/g, '\n');

  // 4. 检查是否误贴了证书文件 apiclient_cert.pem
  if (s.includes('BEGIN CERTIFICATE')) {
    throw new Error('检测到环境变量中填写的是证书文件(apiclient_cert.pem)，请更换为商户私钥文件(apiclient_key.pem)');
  }

  // 5. 提取并规范化 PEM 头尾与 Base64 内容
  const headerMatch = s.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----/);
  const footerMatch = s.match(/-----END (?:RSA )?PRIVATE KEY-----/);
  if (headerMatch && footerMatch) {
    const header = headerMatch[0];
    const footer = footerMatch[0];
    const startIndex = s.indexOf(header) + header.length;
    const endIndex = s.indexOf(footer);
    const body = s.slice(startIndex, endIndex).replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) || [];
    return header + '\n' + lines.join('\n') + '\n' + footer + '\n';
  }

  // 6. 如果用户提供的是没有头尾的纯 Base64 内容
  if (!s.includes('BEGIN') && !s.includes('KEY')) {
    try {
      const decoded = Buffer.from(s, 'base64').toString('utf8');
      if (decoded.includes('PRIVATE KEY')) {
        return normalizePrivateKey(decoded);
      }
    } catch (_) {}
  }

  throw new Error('微信支付商户私钥 PEM 格式不合法，请核对商户私钥内容或改用 WECHAT_PAY_PRIVATE_KEY_BASE64 环境变量配置');
}

let cachedV3PrivateKey = null;

function getPrivateKey() {
  if (cachedV3PrivateKey) return cachedV3PrivateKey;

  let rawKey = '';

  // 优先级 1: 优先读取 Base64 环境变量
  const base64Env = process.env.MCH_PRIVATE_KEY_BASE64 ||
                    process.env.WECHAT_PAY_PRIVATE_KEY_BASE64;
  if (base64Env && base64Env.trim()) {
    try {
      rawKey = Buffer.from(base64Env.trim(), 'base64').toString('utf8');
    } catch (e) {
      throw new Error('MCH_PRIVATE_KEY_BASE64 解码失败，请确认是否为合法 Base64 格式');
    }
  }

  // 优先级 2: 读取标准环境变量
  if (!rawKey) {
    rawKey = process.env.WECHAT_PAY_PRIVATE_KEY ||
             process.env.MCH_PRIVATE_KEY ||
             process.env.MERCHANT_PRIVATE_KEY ||
             process.env.PRIVATE_KEY || '';
  }

  // 优先级 3: 本地证书文件
  if (!rawKey) {
    const candidatePaths = [
      path.join(__dirname, '../cert/apiclient_key.pem'),
      path.join(__dirname, '../../payment/cert/apiclient_key.pem'),
      path.join(__dirname, '../../cert/apiclient_key.pem')
    ];
    for (const certPath of candidatePaths) {
      if (fs.existsSync(certPath)) {
        try {
          const content = fs.readFileSync(certPath, 'utf8');
          if (content && content.includes('PRIVATE KEY')) {
            rawKey = content;
            break;
          }
        } catch (_) {}
      }
    }
  }

  if (!rawKey || !rawKey.trim()) {
    throw new Error('未配置微信支付商户私钥，请在云开发控制台配置环境变量 WECHAT_PAY_PRIVATE_KEY 或 MCH_PRIVATE_KEY_BASE64');
  }

  const normalizedKey = normalizePrivateKey(rawKey);

  try {
    crypto.createPrivateKey({
      key: normalizedKey,
      format: 'pem'
    });
  } catch (parseErr) {
    throw new Error(`微信支付商户私钥 PEM 校验失败: ${parseErr.message}`);
  }

  cachedV3PrivateKey = normalizedKey;
  return cachedV3PrivateKey;
}

function getMchId() {
  return (process.env.WECHAT_PAY_MCH_ID || process.env.MCH_ID || process.env.WECHAT_MCH_ID || DEFAULT_MCH_ID).trim();
}

function getAppId() {
  return (process.env.WECHAT_APP_ID || process.env.APP_ID || DEFAULT_APP_ID).trim();
}

function getSerialNo() {
  const serialNo = (process.env.WECHAT_PAY_CERT_SERIAL_NO || process.env.WECHAT_PAY_SERIAL_NO || process.env.SERIAL_NO || process.env.WECHAT_SERIAL_NO || '').trim();
  if (!serialNo) {
    throw new Error('未配置微信支付商户证书序列号，请在云开发控制台环境变量中配置 WECHAT_PAY_CERT_SERIAL_NO');
  }
  return serialNo;
}

/**
 * 为请求生成 APIv3 Authorization 鉴权头
 */
function buildAuthorization(method, urlPath, bodyStr = '') {
  const mchid = getMchId();
  const serialNo = getSerialNo();
  const privateKey = getPrivateKey();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${bodyStr}\n`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const signature = signer.sign(privateKey, 'base64');
  const auth = `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${serialNo}"`;
  return { auth, timestamp, nonce };
}

/**
 * 发送 HTTPS 请求至微信支付官方 APIv3
 */
function requestV3(method, urlPath, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
    const { auth } = buildAuthorization(method, urlPath, bodyStr);

    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'SNEAKER-LAB-V3/1.0',
      'Authorization': auth
    };
    if (method === 'POST' || method === 'PUT') {
      headers['Content-Type'] = 'application/json';
    }

    const req = https.request('https://api.mch.weixin.qq.com' + urlPath, {
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = {};
        if (data) {
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            parsed = { raw: data };
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          const err = new Error(parsed.message || `微信支付接口返回状态码 ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.code = parsed.code || 'WECHAT_PAY_ERROR';
          err.detail = parsed;
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`微信支付网关网络请求异常: ${err.message}`));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * 1. JSAPI 下单 (免云调用，直接生成拉起 wx.requestPayment 的前端参数)
 */
async function createJsapiPayment(order, openid) {
  const appId = getAppId();
  const mchId = getMchId();
  const privateKey = getPrivateKey();

  const notifyUrl = process.env.PAYMENT_NOTIFY_URL ||
    'https://YOUR_CLOUDBASE_ENV_ID-1484807245.ap-shanghai.app.tcloudbase.com/paymentCallback';

  const body = {
    appid: appId,
    mchid: mchId,
    description: '通用商城商品订单',
    out_trade_no: order.orderNo,
    notify_url: notifyUrl,
    amount: {
      total: order.payAmount,
      currency: 'CNY'
    },
    payer: {
      openid: openid
    }
  };

  const res = await requestV3('POST', '/v3/pay/transactions/jsapi', body);
  if (!res.prepay_id) {
    throw new Error('微信支付预下单未返回 prepay_id');
  }

  // 组装小程序拉起支付的 5 项签名参数
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const packageStr = `prepay_id=${res.prepay_id}`;

  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const paySign = signer.sign(privateKey, 'base64');

  return {
    timeStamp,
    nonceStr,
    package: packageStr,
    signType: 'RSA',
    paySign
  };
}

/**
 * 2. 查单接口 (通过商户订单号核验微信支付真实状态)
 */
async function queryPayment(order) {
  const mchId = getMchId();
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderNo)}?mchid=${mchId}`;

  try {
    const res = await requestV3('GET', path);
    if (res.trade_state === 'SUCCESS') {
      return {
        tradeState: 'SUCCESS',
        orderId: order._id,
        totalFee: res.amount ? res.amount.total : order.payAmount,
        openid: res.payer ? res.payer.openid : order.userId,
        transactionId: res.transaction_id,
        isTest: false
      };
    }
    return {
      tradeState: res.trade_state || 'NOT_PAID',
      tradeStateDesc: res.trade_state_desc || ''
    };
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'ORDER_NOT_EXIST') {
      return { tradeState: 'NOT_FOUND' };
    }
    throw err;
  }
}

/**
 * 3. 申请退款接口
 */
async function createRefund(order, refundNo, reason) {
  const body = {
    out_trade_no: order.orderNo,
    out_refund_no: refundNo,
    reason: reason || '协商退款',
    amount: {
      refund: order.payAmount,
      total: order.payAmount,
      currency: 'CNY'
    }
  };
  return await requestV3('POST', '/v3/refund/domestic/refunds', body);
}

/**
 * 4. 查询退款状态
 */
async function queryRefund(refundNo) {
  const path = `/v3/refund/domestic/refunds/${encodeURIComponent(refundNo)}`;
  return await requestV3('GET', path);
}

/**
 * 5. 关闭订单接口
 */
async function closeOrder(orderNo) {
  const mchId = getMchId();
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}/close`;
  try {
    return await requestV3('POST', path, { mchid: mchId });
  } catch (err) {
    // 若订单不存在或已关闭，视为关单成功
    if (err.statusCode === 404 || err.code === 'ORDER_NOT_EXIST' || (err.detail && err.detail.code === 'ORDER_NOT_EXIST')) {
      return { success: true, alreadyClosed: true };
    }
    throw err;
  }
}

module.exports = {
  createJsapiPayment,
  queryPayment,
  createRefund,
  queryRefund,
  closeOrder,
  getMchId,
  getAppId
};

