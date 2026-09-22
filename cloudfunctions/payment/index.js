/**
 * 微信支付服务云函数 (payment)
 * 纯自包含实现，直连微信支付官方 APIv3 (JSAPI)，无子目录路径依赖
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// 微信支付与商户核心配置 (支持环境变量优先覆盖)
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
    console.error('[PAY-CONFIG] private key check failed: 检测到环境变量填入的是 apiclient_cert.pem 证书文件');
    throw err('INVALID_MCH_PRIVATE_KEY_FILE', '检测到环境变量中填写的是证书文件(apiclient_cert.pem)，请更换为商户私钥文件(apiclient_key.pem)');
  }

  // 5. 提取并规范化 PEM 头尾与 Base64 内容（彻底解决换行被浏览器输入框吞成空格的问题）
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

  throw err('INVALID_MCH_PRIVATE_KEY_FORMAT', '微信支付商户私钥 PEM 格式不合法，请核对商户私钥内容或改用 WECHAT_PAY_PRIVATE_KEY_BASE64 环境变量配置');
}

let cachedPrivateKey = null;

function getPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;

  let rawKey = '';

  // 优先级 1: 优先读取 Base64 环境变量 (最稳妥，避免换行被浏览器输入框破坏)
  const base64Env = process.env.MCH_PRIVATE_KEY_BASE64 ||
                    process.env.WECHAT_PAY_PRIVATE_KEY_BASE64;
  if (base64Env && base64Env.trim()) {
    try {
      rawKey = Buffer.from(base64Env.trim(), 'base64').toString('utf8');
    } catch (e) {
      throw err('INVALID_MCH_PRIVATE_KEY_FORMAT', 'MCH_PRIVATE_KEY_BASE64 解码失败，请确认是否为合法 Base64 格式');
    }
  }

  // 优先级 2: 读取标准环境变量 (支持 WECHAT_PAY_PRIVATE_KEY, MCH_PRIVATE_KEY, MERCHANT_PRIVATE_KEY, PRIVATE_KEY)
  if (!rawKey) {
    rawKey = process.env.WECHAT_PAY_PRIVATE_KEY ||
             process.env.MCH_PRIVATE_KEY ||
             process.env.MERCHANT_PRIVATE_KEY ||
             process.env.PRIVATE_KEY || '';
  }

  // 优先级 3: 本地证书文件 (由 .gitignore 严格忽略，仅用于本地开发)
  if (!rawKey) {
    const candidatePaths = [
      path.join(__dirname, 'cert/apiclient_key.pem'),
      path.join(__dirname, '../paymentCallback/cert/apiclient_key.pem'),
      path.join(__dirname, '../cert/apiclient_key.pem')
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
    throw err('CONFIG_ERROR', '未配置微信支付商户私钥，请在云开发控制台配置环境变量 WECHAT_PAY_PRIVATE_KEY 或 MCH_PRIVATE_KEY_BASE64');
  }

  // 规范化 PEM 格式
  const normalizedKey = normalizePrivateKey(rawKey);

  // 启动/加载时执行 crypto.createPrivateKey 严格验证
  try {
    crypto.createPrivateKey({
      key: normalizedKey,
      format: 'pem'
    });
    console.log('[PAY-CONFIG] private key parse: OK', {
      privateKeyConfigured: true,
      privateKeyFormatValid: true,
      privateKeyParseSuccess: true
    });
  } catch (parseErr) {
    console.error('[PAY-CONFIG] private key parse: FAILED', {
      error: parseErr.message,
      privateKeyConfigured: true,
      privateKeyFormatValid: false,
      privateKeyParseSuccess: false
    });
    throw err('INVALID_MCH_PRIVATE_KEY_FORMAT', `微信支付商户私钥 PEM 校验失败: ${parseErr.message}`);
  }

  cachedPrivateKey = normalizedKey;
  return cachedPrivateKey;
}

function getMchId() {
  return (process.env.WECHAT_PAY_MCH_ID || process.env.MCH_ID || process.env.WECHAT_MCH_ID || DEFAULT_MCH_ID).trim();
}

function getAppId() {
  return (process.env.WECHAT_APP_ID || process.env.APP_ID || DEFAULT_APP_ID).trim();
}

function getSerialNo() {
  const serialNo = (process.env.WECHAT_PAY_CERT_SERIAL_NO || process.env.WECHAT_PAY_SERIAL_NO || process.env.SERIAL_NO || process.env.WECHAT_SERIAL_NO || '').trim();
  if (!serialNo) throw err('CONFIG_ERROR', '未配置微信支付商户证书序列号，请在云开发控制台环境变量中配置 WECHAT_PAY_CERT_SERIAL_NO');
  return serialNo;
}

function getApiV3Key() {
  const v3Key = (process.env.WECHAT_PAY_API_V3_KEY || process.env.API_V3_KEY || process.env.WECHAT_API_V3_KEY || '').trim();
  if (!v3Key) throw err('CONFIG_ERROR', '未配置微信支付 APIv3 密钥，请在云开发控制台环境变量中配置 WECHAT_PAY_API_V3_KEY');
  return v3Key;
}

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function key(...parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

function text(value, name, min = 1, max = 200) {
  const s = String(value || '').trim();
  if (s.length < min || s.length > max) throw err('INVALID_PARAMS', `${name}格式不正确`);
  return s;
}

function success(data = null, message = '操作成功') {
  return {
    success: true,
    code: 'OK',
    message,
    data,
    requestId: (crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random())),
    serverTime: Date.now()
  };
}

function fail(code = 'SYSTEM_ERROR', message = '系统内部错误') {
  return {
    success: false,
    code: (typeof code === 'string' && /^[A-Z_]{3,50}$/.test(code)) ? code : 'SYSTEM_ERROR',
    message: message || '服务暂时不可用，请稍后重试',
    data: null,
    requestId: (crypto.randomUUID ? crypto.randomUUID() : key(Date.now(), Math.random())),
    serverTime: Date.now()
  };
}

async function safeDocGet(collection, docId) {
  try {
    const res = await db.collection(collection).doc(docId).get();
    return Array.isArray(res.data) ? res.data[0] || null : res.data || null;
  } catch (e) {
    return null;
  }
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
 * 发送 HTTPS 请求至微信支付官方 APIv3 (带 8 秒主动超时保护)
 */
function requestV3(method, urlPath, bodyObj = null, timeoutMs = 8000) {
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

    let settled = false;
    const req = https.request('https://api.mch.weixin.qq.com' + urlPath, {
      method,
      headers,
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (settled) return;
        settled = true;
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
          const e = new Error(parsed.message || `微信支付接口返回状态码 ${res.statusCode}`);
          e.statusCode = res.statusCode;
          e.code = parsed.code || 'WECHAT_PAY_ERROR';
          e.detail = parsed;
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      if (settled) return;
      settled = true;
      req.destroy();
      const e = new Error(`微信支付网关连接/响应超时 (${timeoutMs}ms)`);
      e.code = 'WECHAT_PAY_API_TIMEOUT';
      reject(e);
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`微信支付网关网络请求异常: ${err.message}`));
    });

    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

/**
 * JSAPI 下单
 */
async function createJsapiPayment(order, openid, startTime = Date.now()) {
  const appId = getAppId();
  const mchId = getMchId();
  const privateKey = getPrivateKey();

  console.log(`[PAY-06] 准备微信支付请求完成, t=${Date.now() - startTime}ms`);

  const notifyUrl = process.env.PAYMENT_NOTIFY_URL ||
    'https://YOUR_CLOUDBASE_ENV_ID-1484807245.ap-shanghai.app.tcloudbase.com/paymentCallback';

  // 严格核对并转换支付金额 (1分钱 = 1，必须是正整数)
  const totalAmount = Math.max(1, Math.round(Number(order.payAmount) || 1));
  if (!Number.isInteger(totalAmount)) {
    throw err('INVALID_AMOUNT', '支付金额必须为有效整数分');
  }

  const body = {
    appid: appId,
    mchid: mchId,
    description: '通用商城商品订单',
    out_trade_no: order.orderNo,
    notify_url: notifyUrl,
    amount: {
      total: totalAmount,
      currency: 'CNY'
    },
    payer: {
      openid: openid
    }
  };

  console.log(`[PAY-07] 开始调用微信支付下单接口 POST /v3/pay/transactions/jsapi, 金额: ${totalAmount}分, t=${Date.now() - startTime}ms`);
  const res = await requestV3('POST', '/v3/pay/transactions/jsapi', body, 8000);
  console.log(`[PAY-08] 微信支付下单接口返回, t=${Date.now() - startTime}ms`);

  const prepayId = res ? res.prepay_id : '';
  const hasPrepay = typeof prepayId === 'string' && prepayId.length > 0;
  console.log(`[PAY-09] 是否获得 prepay_id: ${hasPrepay ? '获得' : '未获得'}${hasPrepay ? ` (${prepayId.slice(0, 16)}...)` : ''}, t=${Date.now() - startTime}ms`);

  if (!hasPrepay) {
    throw err('PREPAY_ID_MISSING', '微信支付预下单未返回 prepay_id');
  }

  // 组装小程序拉起支付的 5 项签名参数
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const packageStr = `prepay_id=${prepayId}`;

  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const paySign = signer.sign(privateKey, 'base64');

  console.log(`[PAY-10] 支付参数签名完成, t=${Date.now() - startTime}ms`);

  return {
    appId,
    timeStamp,
    nonceStr,
    package: packageStr,
    signType: 'RSA',
    paySign
  };
}

/**
 * 查单接口
 */
async function queryV3Payment(order) {
  const mchId = getMchId();
  const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderNo)}?mchid=${mchId}`;

  try {
    const res = await requestV3('GET', urlPath, null, 6000);
    return res;
  } catch (err) {
    if (err.statusCode === 404 || err.code === 'ORDER_NOT_EXIST') {
      return { trade_state: 'NOT_FOUND' };
    }
    throw err;
  }
}

exports.main = async (event) => {
  const startTime = Date.now();
  const { action, params = {} } = event || {};
  console.log(`[PAY-01] 云函数启动 [action=${action}], t=${Date.now() - startTime}ms`);

  try {
    const openid = cloud.getWXContext().OPENID;
    if (!openid) {
      console.error('[PAY-02-FAIL] 未获取到有效 OPENID');
      return fail('OPENID_MISSING', '未获取到用户登录凭证 (OPENID)');
    }
    console.log(`[PAY-02] 获取 OPENID 完成 (${openid.slice(0, 8)}...), t=${Date.now() - startTime}ms`);

    const orderQuery = text(params.orderId || params.id || params.orderNo || params.outTradeNo || params.out_trade_no, '订单标识', 1, 100);

    async function findPaymentOrder(q) {
      let ord = await safeDocGet('orders', q);
      if (ord) {
        if (ord.userId !== openid) throw err('PERMISSION_DENIED', '订单不存在或无权访问');
        return ord;
      }
      try {
        const res = await db.collection('orders').where({ orderNo: q }).limit(1).get();
        if (res.data && res.data.length > 0) {
          ord = res.data[0];
          if (ord.userId !== openid) throw err('PERMISSION_DENIED', '订单不存在或无权访问');
          return ord;
        }
      } catch (_) {}
      try {
        const res = await db.collection('orders').where({ outTradeNo: q }).limit(1).get();
        if (res.data && res.data.length > 0) {
          ord = res.data[0];
          if (ord.userId !== openid) throw err('PERMISSION_DENIED', '订单不存在或无权访问');
          return ord;
        }
      } catch (_) {}
      throw err('PERMISSION_DENIED', '订单不存在或无权访问');
    }

    const order = await findPaymentOrder(orderQuery);
    const orderId = order._id;

    // 1. 查询订单支付状态 (真机支付完成后核验)
    if (action === 'queryOrder') {
      if (order.status === 'PAID') {
        return success({ status: 'PAID', orderId: order._id, orderNo: order.orderNo });
      }
      if (order.status !== 'PENDING_PAYMENT' || !order.paymentInitiated) {
        return success({ status: order.status, orderId: order._id });
      }

      // 请求微信支付网关验证
      try {
        const v3Result = await queryV3Payment(order);
        if (v3Result.trade_state === 'SUCCESS') {
          // 支付确认入账并扣减库存
          const payNow = new Date();
          await db.collection('orders').doc(orderId).update({
            data: {
              status: 'PAID',
              orderStatus: 'PAID',
              paymentStatus: 'PAID',
              paymentTradeNo: v3Result.transaction_id || '',
              transactionId: v3Result.transaction_id || '',
              paidAt: payNow,
              payTime: payNow,
              updatedAt: payNow,
              updateTime: payNow
            }
          });

          // 扣减实物库存与锁定库存
          for (const item of (order.items || [])) {
            const sku = await safeDocGet('product_skus', item.skuId);
            if (sku) {
              const newLocked = Math.max(0, (sku.lockedStock || 0) - item.count);
              const newStock = Math.max(0, (sku.stock || 0) - item.count);
              await db.collection('product_skus').doc(item.skuId).update({
                data: { stock: newStock, lockedStock: newLocked, updatedAt: new Date() }
              });
              const p = await safeDocGet('products', item.productId);
              if (p) {
                await db.collection('products').doc(item.productId).update({
                  data: { sales: (p.sales || 0) + item.count, updatedAt: new Date() }
                });
              }
            }
          }

          // 记录交易账单
          try {
            await db.collection('payment_transactions').add({
              data: {
                orderId: order._id,
                userId: order.userId,
                outTradeNo: order.orderNo,
                transactionId: v3Result.transaction_id || '',
                totalFee: order.payAmount,
                status: 'SUCCESS',
                createdAt: new Date()
              }
            });
          } catch (_) {}

          // 支付成功：将该支付单下所有子订单一并置为 PAID
          try {
            const subs = await db.collection('merchant_orders').where({ parentOrderId: order._id }).get();
            const paidSubs = (subs.data || []).filter(s => s.status === 'PENDING_PAYMENT');
            await Promise.all(paidSubs.map(s => db.collection('merchant_orders').doc(s._id).update({
              data: { status: 'PAID', paidAt: payNow, updatedAt: payNow }
            })));
          } catch (subErr) {
            console.warn('[queryOrder] merchant_orders sync PAID warn:', subErr);
          }

          return success({ status: 'PAID', orderId: order._id, orderNo: order.orderNo });
        }
      } catch (qErr) {
        console.warn('[queryOrder warning]:', qErr);
      }
      return success({ status: order.status, orderId: order._id });
    }

    // 2. 发起微信支付 (严禁死循环等待付款，拿到 prepay_id 立即快速 return)
    if (action === 'createPayment') {
      console.log(`[PAY-03] 查询商城订单完成 (orderNo: ${order.orderNo}), t=${Date.now() - startTime}ms`);
      console.log(`[PAY-04] 服务端校验订单完成 (status: ${order.status}), t=${Date.now() - startTime}ms`);

      if (order.status !== 'PENDING_PAYMENT' || new Date(order.expireAt).getTime() <= Date.now()) {
        throw err('INVALID_ORDER_STATUS', '订单已失效或已完成支付');
      }

      console.log(`[PAY-05] 服务端确定金额完成 (payAmount: ${order.payAmount}分), t=${Date.now() - startTime}ms`);

      // 异步标记支付已发起，不阻塞流程
      db.collection('orders').doc(orderId).update({
        data: { paymentInitiated: true, updatedAt: new Date() }
      }).catch(err => console.warn('[paymentInitiated mark warn]:', err));

      let payment;
      const isLocalMock = process.env.APP_ENV === 'local' && (process.env.PAYMENT_MODE === 'test' || process.env.ENABLE_TEST_PAYMENTS === 'true');
      if (isLocalMock) {
        const timeStamp = Math.floor(Date.now() / 1000).toString();
        const nonceStr = crypto.randomBytes(16).toString('hex');
        const packageStr = `prepay_id=mock_prepay_${Date.now()}`;
        const message = `${getAppId()}\n${timeStamp}\n${nonceStr}\n${packageStr}\n`;
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(message);
        const paySign = signer.sign(getPrivateKey(), 'base64');
        payment = { appId: getAppId(), timeStamp, nonceStr, package: packageStr, signType: 'RSA', paySign };
      } else {
        payment = await createJsapiPayment(order, openid, startTime);
      }

      console.log(`[PAY-11] 云函数准备 return, 总耗时=${Date.now() - startTime}ms`);
      return success({
        orderId: order._id,
        orderNo: order.orderNo,
        payment,
        mode: 'wechat'
      });
    }

    throw err('ACTION_NOT_FOUND', `未知的支付操作: ${action}`);
  } catch (e) {
    const elapsed = Date.now() - startTime;
    console.error(`[payment error, t=${elapsed}ms]:`, {
      code: e.code,
      message: e.message,
      statusCode: e.statusCode,
      detail: e.detail
    });
    return fail(e.code, e.message);
  }
};

