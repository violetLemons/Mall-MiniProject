const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function getCommon(name) {
  try {
    return require(`./common/${name}`);
  } catch (e) {
    return require(`../common/${name}`);
  }
}

const { success, fail } = getCommon('response');
const { createToken, permissionVersion, maskSecret } = getCommon('crypto');

function issueMerchantToken(adm, fallbackPhone = '') {
  if (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.length < 32) {
    process.env.ADMIN_JWT_SECRET = '636353631d78ee1619556dc0a92cd2f4111317b5820e821a6d307de9947b6bbf';
  }
  const token = createToken({ adminId: adm._id, version: permissionVersion(adm) }, 12 * 3600);
  return success({
    token,
    adminId: adm._id,
    username: adm.username,
    name: adm.name || '',
    phone: adm.phone || fallbackPhone,
    address: adm.address || '',
    role: adm.role,
    permissions: adm.permissions || [],
    merchantId: adm.merchantId || null,
    subMchIdMask: adm.subMchIdEnc ? maskSecret(adm.subMchIdEnc) : '',
    expiresIn: 12 * 3600
  }, '商户登录成功');
}

exports.main = async (event, context) => {
  const { action, params = {} } = event;

  try {
    /**
     * 商户一键登录：用 getPhoneNumber 的 code 换明文手机号，
     * 匹配 admins 里 role=MERCHANT && phone==手机号 && status=ACTIVE，
     * 命中则签发与 admin-web 同体系的 JWT token（复用 adminProducts/adminOrders 等云函数）。
     */
    if (action === 'merchantLogin') {
      const { phoneCode } = params;
      if (!phoneCode || typeof phoneCode !== 'string') {
        return fail('INVALID_PARAMS', '缺少手机号凭证');
      }

      let phone;
      try {
        const r = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode });
        phone = r && r.phoneInfo && r.phoneInfo.purePhoneNumber;
      } catch (e) {
        console.error('[merchantAuth][merchantLogin] getPhoneNumber failed:', e);
        return fail('PHONE_AUTH_FAILED', '手机号授权校验失败，请重试');
      }
      if (!phone) return fail('PHONE_AUTH_FAILED', '未获取到手机号');

      const res = await db.collection('admins')
        .where({ role: 'MERCHANT', phone, status: 'ACTIVE' })
        .limit(1)
        .get();
      const adm = res.data[0];
      if (!adm) return fail('NOT_MERCHANT', '该手机号未关联商户账号，请先到商户后台绑定手机号');

      return issueMerchantToken(adm, phone);
    }

    /**
     * 开发/预览专用登录：跳过微信手机号授权，直接按 username 或 merchantId 登录 MERCHANT 账号。
     * 仅用于本地预览商户端；上线前需移除或加环境开关。
     */
    if (action === 'devLogin') {
      const username = params.username ? String(params.username).trim() : '';
      const merchantId = params.merchantId ? String(params.merchantId).trim() : '';
      if (!username && !merchantId) return fail('INVALID_PARAMS', '缺少 username 或 merchantId');
      const where = { role: 'MERCHANT', status: 'ACTIVE' };
      if (username) where.username = username;
      else where.merchantId = merchantId;
      const res = await db.collection('admins').where(where).limit(1).get();
      const adm = res.data[0];
      if (!adm) return fail('NOT_MERCHANT', '未找到可用商户账号');
      return issueMerchantToken(adm, '');
    }

    return fail('ACTION_NOT_FOUND', `未知指令: ${action}`);
  } catch (err) {
    console.error(`[merchantAuth][${action}] Error:`, err);
    return fail(err.code || 'SYSTEM_ERROR', err.message || '商户登录异常');
  }
};
