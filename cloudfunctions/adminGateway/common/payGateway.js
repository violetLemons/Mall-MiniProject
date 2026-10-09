const crypto = require('crypto');
const https = require('https');
const failure = (code, message) => Object.assign(new Error(message), { code });
function required(name) {
  const value = process.env[name];
  if (!value || /YOUR_|wxYOUR/.test(value)) throw failure('CONFIG_ERROR', `${name} 未配置`);
  return value;
}
function pem(value) { return value.replace(/\\n/g, '\n'); }
function config() {
  const apiKey = required('WECHAT_PAY_API_V3_KEY');
  if (Buffer.byteLength(apiKey) !== 32) throw failure('CONFIG_ERROR', 'API v3 密钥必须为 32 字节');
  const privateKey = process.env.WECHAT_PAY_PRIVATE_KEY_BASE64
    ? Buffer.from(process.env.WECHAT_PAY_PRIVATE_KEY_BASE64, 'base64').toString('utf8') : pem(required('WECHAT_PAY_PRIVATE_KEY'));
  crypto.createPrivateKey(privateKey);
  return { appId: required('WECHAT_APP_ID'), mchId: required('WECHAT_PAY_MCH_ID'), serial: required('WECHAT_PAY_SERIAL_NO'), privateKey, apiKey };
}
function verify(headers, raw) {
  const h = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const timestamp = h['wechatpay-timestamp'], nonce = h['wechatpay-nonce'], serial = h['wechatpay-serial'], signature = h['wechatpay-signature'];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !nonce || !serial || !signature)
    throw failure('SIGNATURE_INVALID', '微信支付签名头无效');
  let keys;
  try { keys = JSON.parse(required('WECHAT_PAY_PLATFORM_KEYS_JSON')); } catch { throw failure('CONFIG_ERROR', '微信支付平台验签公钥未配置'); }
  if (!Object.prototype.hasOwnProperty.call(keys, serial) || typeof keys[serial] !== 'string') throw failure('SIGNATURE_INVALID', '未知微信支付验签密钥');
  if (!crypto.verify('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`), pem(keys[serial]), Buffer.from(signature, 'base64')))
    throw failure('SIGNATURE_INVALID', '微信支付验签失败');
}
async function request(method, path, data) {
  const c = config(), body = data ? JSON.stringify(data) : '';
  const timestamp = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomBytes(16).toString('hex');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`), c.privateKey).toString('base64');
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${c.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${c.serial}",signature="${signature}"`;
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'api.mch.weixin.qq.com', path, method, headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'single-merchant/1.0' } }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; if (raw.length > 1048576) req.destroy(failure('PAYMENT_UNCERTAIN', '微信响应过大')); });
      res.on('end', () => {
        try {
          verify(res.headers, raw);
          const result = raw ? JSON.parse(raw) : {};
          if (res.statusCode < 200 || res.statusCode >= 300) throw failure(result.code || 'WECHAT_ERROR', '微信支付请求失败，须查单核实');
          resolve(result);
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(10000, () => req.destroy(failure('PAYMENT_UNCERTAIN', '微信支付请求超时，请查单核实')));
    req.on('error', reject); req.end(body);
  });
}
function paymentEvidence(order, result) {
  const c = config();
  if (result.appid !== c.appId || result.mchid !== c.mchId || result.out_trade_no !== order.orderNo)
    throw failure('PAYMENT_IDENTITY_MISMATCH', '支付身份不匹配');
  if (result.trade_state !== 'SUCCESS') return { tradeState: result.trade_state };
  if (result.amount?.currency !== 'CNY' || !Number.isSafeInteger(result.amount.total) || !result.transaction_id || !result.payer?.openid)
    throw failure('PAYMENT_EVIDENCE_INVALID', '支付凭证缺少必填字段');
  return { tradeState: 'SUCCESS', orderId: order._id, totalFee: result.amount.total, openid: result.payer.openid, transactionId: result.transaction_id, isTest: false };
}
async function queryPayment(cloud, order) {
  const c = config();
  try { return paymentEvidence(order, await request('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderNo)}?mchid=${encodeURIComponent(c.mchId)}`)); }
  catch (e) { if (e.code === 'ORDER_NOT_EXIST') return { tradeState: 'NOT_FOUND' }; throw e; }
}
async function closePayment(order) { const c = config(); return request('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderNo)}/close`, { mchid: c.mchId }); }
async function createPayment(order) {
  const c = config();
  const notify = required('WECHAT_PAY_NOTIFY_URL');
  if (!notify.startsWith('https://')) throw failure('CONFIG_ERROR', '支付回调必须为 HTTPS');
  const result = await request('POST', '/v3/pay/transactions/jsapi', { appid: c.appId, mchid: c.mchId, description: '商城订单', out_trade_no: order.orderNo,
    time_expire: new Date(order.expireAt).toISOString(), notify_url: notify, amount: { total: order.payAmount, currency: 'CNY' }, payer: { openid: order.userId } });
  if (!result.prepay_id) throw failure('PAYMENT_UNCERTAIN', '微信未返回预支付凭证');
  const timeStamp = String(Math.floor(Date.now() / 1000)), nonceStr = crypto.randomBytes(16).toString('hex'), packageValue = `prepay_id=${result.prepay_id}`;
  const paySign = crypto.sign('RSA-SHA256', Buffer.from(`${c.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`), c.privateKey).toString('base64');
  return { timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign };
}
function decryptNotification(event) {
  if (typeof event.body !== 'string') throw failure('INVALID_PARAMS', '只接受原始 HTTP 通知');
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (Buffer.byteLength(raw) > 1048576) throw failure('INVALID_PARAMS', '通知过大');
  verify(event.headers, raw);
  const envelope = JSON.parse(raw), r = envelope.resource;
  if (!envelope.id || r?.algorithm !== 'AEAD_AES_256_GCM' || r?.nonce?.length !== 12) throw failure('INVALID_PARAMS', '通知结构无效');
  const bytes = Buffer.from(r.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(config().apiKey), Buffer.from(r.nonce));
  decipher.setAuthTag(bytes.subarray(-16)); decipher.setAAD(Buffer.from(r.associated_data || ''));
  const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString('utf8'));
  return { id: envelope.id, type: envelope.event_type, data };
}
async function createRefund(order, refund) {
  const notify = required('WECHAT_REFUND_NOTIFY_URL');
  if (!notify.startsWith('https://')) throw failure('CONFIG_ERROR', '退款回调必须为 HTTPS');
  return { ...(await request('POST', '/v3/refund/domestic/refunds', { transaction_id: order.paymentTradeNo, out_refund_no: refund.outRefundNo, reason: refund.reason,
    notify_url: notify, amount: { refund: refund.refundFee, total: refund.totalFee, currency: 'CNY' } })), mchid: config().mchId };
}
const queryRefund = async refundNo => ({ ...(await request('GET', `/v3/refund/domestic/refunds/${encodeURIComponent(refundNo)}`)), mchid: config().mchId });
module.exports = { config, verify, request, paymentEvidence, queryPayment, closePayment, createPayment, decryptNotification, createRefund, queryRefund };
