const { error } = require('./commerce');
const { getValidatedWechatPayConfig, getWechatPayMerchantId } = require('./config');
async function queryPayment(cloud, order) {
  const config = getValidatedWechatPayConfig();
  const merchantId = getWechatPayMerchantId();
  let r;
  try {
    r = await cloud.cloudPay.queryOrder({ outTradeNo: order.orderNo, subMchId: merchantId });
  } catch (e) {
    throw error('PAYMENT_UNCERTAIN', '微信支付状态待核实');
  }
  const field = (a, b) => r[a] === undefined ? r[b] : r[a];
  if (field('returnCode', 'return_code') !== 'SUCCESS') throw error('PAYMENT_UNCERTAIN', '微信支付查询失败');
  if (field('errCode', 'err_code') === 'ORDERNOTEXIST') return { tradeState: 'NOT_FOUND' };
  if (field('resultCode', 'result_code') !== 'SUCCESS') throw error('PAYMENT_UNCERTAIN', '微信支付状态待核实');
  const tradeState = field('tradeState', 'trade_state');
  if (tradeState !== 'SUCCESS') return { tradeState };
  const appid = field('subAppid', 'sub_appid') || r.appid;
  const mchid = field('subMchId', 'sub_mch_id') || field('mchId', 'mch_id');
  if (appid !== config.appId) throw error('APPID_MISMATCH', '支付 AppID 不匹配');
  if (mchid !== merchantId) throw error('MCHID_MISMATCH', '支付商户号不匹配');
  if (field('outTradeNo', 'out_trade_no') !== order.orderNo) throw error('PAYMENT_IDENTITY_MISMATCH', '支付订单号不匹配');
  return { tradeState, orderId: order._id, totalFee: Number(field('totalFee', 'total_fee')), openid: field('subOpenid', 'sub_openid') || r.openid,
    transactionId: field('transactionId', 'transaction_id'), isTest: false };
}
module.exports = { queryPayment };
