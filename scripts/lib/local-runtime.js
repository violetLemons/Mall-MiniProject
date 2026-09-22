const { AsyncLocalStorage } = require('async_hooks');
const Module = require('module'), path = require('path');
function loadRuntime(db) {
  const identity = new AsyncLocalStorage();
  const cloud = { init() {}, database: () => db, DYNAMIC_CURRENT_ENV: 'local-isolated', getWXContext: () => identity.getStore() || {},
    cloudPay: new Proxy({}, { get: () => async () => { throw new Error('REAL_PAYMENT_DISABLED_LOCALLY'); } }) };
  const root = path.resolve(__dirname, '../../cloudfunctions');
  const oldLoad = Module._load;
  Module._load = function(id, parent, main) { if (id === 'wx-server-sdk' && parent?.filename.startsWith(root + path.sep)) return cloud; return oldLoad.call(this, id, parent, main); };
  const names = ['auth', 'products', 'cart', 'orders', 'payment', 'paymentCallback', 'addresses', 'pickupPoints', 'adminAuth', 'adminProducts', 'adminCategories', 'adminBanners', 'adminOrders', 'adminInventory', 'adminUsers', 'testPayment', 'orderTimeoutJob'];
  const handlers = Object.fromEntries(names.map(n => [n, require(path.join(root, n, 'index.js')).main]));
  Module._load = oldLoad;
  return { cloud, call: (name, event, context = {}) => identity.run(context, () => handlers[name](event)), names };
}
module.exports = { loadRuntime };
