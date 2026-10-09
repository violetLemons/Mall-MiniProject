const c = require('./commerce');
const ID = 'store';
const defaults = { mallName: '水果商城', companyName: '', creditCode: '', businessLicenseUrl: '', filingNumber: '', customerServicePhone: '', serviceHours: '', privacyContact: '', shippingRules: [], revision: '', shipWithinHours: 48 };
async function read(db) { return { ...defaults, ...await c.get(db, 'store_settings', ID), shipWithinHours: 48 }; }
function validate(input) {
  const result = {};
  for (const name of ['mallName','companyName','creditCode','businessLicenseUrl','filingNumber','customerServicePhone','serviceHours','privacyContact']) result[name] = c.text(input[name] || '', name, name === 'mallName' ? 1 : 0, name === 'businessLicenseUrl' ? 2000 : 200);
  if (result.businessLicenseUrl && !/^(https:\/\/|cloud:\/\/)/.test(result.businessLicenseUrl)) throw c.error('INVALID_PARAMS','执照图片须为HTTPS或云存储地址');
  if (!Array.isArray(input.shippingRules) || input.shippingRules.length > 100) throw c.error('INVALID_PARAMS','配送规则最多100条');
  const seen = new Set();
  result.shippingRules = input.shippingRules.map((r,index) => {
    const province = c.text(r.province || '', '省份',0,50), city = c.text(r.city || '', '城市',0,50), district = c.text(r.district || '', '区县',0,50);
    if ((city && !province) || (district && !city)) throw c.error('INVALID_PARAMS','城市须填写省份，区县须填写省市');
    const key = c.key(province,city,district);
    if (seen.has(key)) throw c.error('INVALID_PARAMS','配送区域不能重复'); seen.add(key);
    if (typeof r.deliverable !== 'boolean') throw c.error('INVALID_PARAMS','请选择是否配送');
    return { id: key, province, city, district, deliverable: r.deliverable, firstFee: c.integer(r.firstFee,'首件运费'), additionalFee: c.integer(r.additionalFee,'续件运费'), sort:index };
  });
  return { ...result, shipWithinHours:48, revision:c.key(require('crypto').randomUUID()), updatedAt:new Date() };
}
function freight(settings, address, count) {
  if (!settings.shippingRules.length && c.testMode()) return { amount:0, ruleId:'isolated-test' };
  const matches = settings.shippingRules.filter(r => (!r.province || r.province === address.province) && (!r.city || r.city === address.city) && (!r.district || r.district === address.district));
  matches.sort((a,b)=>(Number(!!b.province)+Number(!!b.city)+Number(!!b.district))-(Number(!!a.province)+Number(!!a.city)+Number(!!a.district)));
  const rule = matches[0];
  if (!rule || !rule.deliverable) throw c.error('DELIVERY_UNAVAILABLE','该收货区域暂不配送，请更换地址或联系客服');
  return { amount:c.integer(rule.firstFee + rule.additionalFee * (count-1),'运费'), ruleId:rule.id };
}
module.exports = { read, validate, freight, ID };
