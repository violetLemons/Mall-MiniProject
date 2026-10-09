const https = require('https');
const { error } = require('./commerce');
let cachedToken;
function request(path, body) {
  return new Promise((resolve, reject) => {
    const raw = body ? JSON.stringify(body) : '';
    const req = https.request({ hostname: 'api.weixin.qq.com', path, method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; if (data.length > 1048576) req.destroy(error('WECHAT_UNCERTAIN', '微信响应过大')); });
      res.on('end', () => { try { const value = JSON.parse(data); if (res.statusCode !== 200 || value.errcode) throw error('WECHAT_API_ERROR', '微信接口失败，请检查权限或配置'); resolve(value); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.setTimeout(10000, () => req.destroy(error('WECHAT_UNCERTAIN', '微信请求超时'))); req.end(raw);
  });
}
async function token() {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  const appid = process.env.WECHAT_APP_ID, secret = process.env.WECHAT_APP_SECRET;
  if (!appid || !secret) throw error('CONFIG_ERROR', '微信应用密钥未配置');
  const data = await request(`/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`);
  if (!data.access_token) throw error('CONFIG_ERROR', '获取微信凭证失败');
  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in - 120) * 1000 }; return cachedToken.value;
}
async function call(cloud, method, path, payload) {
  const api = method.split('.').reduce((v, k) => v?.[k], cloud?.openapi);
  if (typeof api === 'function') {
    const data = await api(payload);
    if (data.errcode || data.errCode) throw error('WECHAT_API_ERROR', '微信接口失败，请检查权限或配置');
    return data;
  }
  return request(`${path}?access_token=${encodeURIComponent(await token())}`, payload);
}
async function checkText(cloud, openid, content, scene) {
  if (!content) return;
  if (!openid) throw error('CONTENT_REVIEW_REQUIRED', '需真实近期访问的小程序用户身份进行内容审核');
  const r = await call(cloud, 'security.msgSecCheck', '/wxa/msg_sec_check', { openid, scene, version: 2, content });
  if (r.result?.suggest !== 'pass') throw error('CONTENT_REVIEW_REQUIRED', '内容未通过微信安全审核');
}
module.exports = { call, checkText, request, token };
