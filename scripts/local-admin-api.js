// Isolated local gateway runs the SAME handlers as deployed cloud functions.
if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') throw new Error('Local gateway is prohibited in production');
process.env.APP_ENV = 'local'; process.env.PAYMENT_MODE = 'test'; process.env.ENABLE_TEST_PAYMENTS = 'true';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createDb } = require('./lib/local-db');
const { loadRuntime } = require('./lib/local-runtime');
const directory = path.resolve(process.env.LOCAL_DATA_DIR || path.join(__dirname, '../work/local-test'));
fs.mkdirSync(directory, { recursive: true });
const credentialsPath = path.join(directory, 'credentials.json');
let credentials;
if (fs.existsSync(credentialsPath)) credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
else { credentials = { username: 'superadmin', password: crypto.randomBytes(18).toString('base64url'), secret: crypto.randomBytes(48).toString('base64url') }; fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2)); }
process.env.ADMIN_JWT_SECRET = credentials.secret;
const { hashPassword } = require('../cloudfunctions/common/crypto');
const filename = path.join(directory, 'database.json');
const salt = crypto.randomBytes(32).toString('hex');
function seedDemoData() {
  const { MOCK_PRODUCTS } = require('../miniprogram/services/mock/products.js');
  const products = MOCK_PRODUCTS.map(p => ({ ...p, _id: p.id, name: p.name || p.title, status: 'ON_SALE', minPrice: p.price, maxPrice: p.originalPrice, totalStock: (p.skus || []).reduce((s, x) => s + (x.stock || 0), 0), deletedAt: null, skuVersion: 1 }));
  const product_skus = MOCK_PRODUCTS.flatMap(p => (p.skus || []).map(s => ({ _id: s.skuId, productId: p.id, skuCode: s.skuId, colorId: s.colorId, colorName: s.colorName, colorImage: s.image || p.cover, size: Number(s.size), price: s.price, originalPrice: s.originalPrice || s.price, stock: s.stock || 0, lockedStock: 0, status: 'ACTIVE' })));
  return {
    admins: [{ _id: 'local_admin', username: credentials.username, passwordHash: hashPassword(credentials.password, salt), salt, role: 'SUPER_ADMIN', permissions: ['*'], sessionVersion: 0, status: 'ACTIVE', createdAt: new Date() }],
    auth_limits: [],
    categories: ['数码', '服饰', '家居', '美妆', '新品', '特惠'].map((name, i) => ({ _id: `c${i + 1}`, id: `c${i + 1}`, name, icon: ['💻', '👕', '🏠', '💄', '🔥', '🏷️'][i], badge: ['热门', '日常', '实用', '热销', 'NEW', '折扣'][i], sort: 100 - i, status: 'ACTIVE' })),
    products, product_skus, carts: [], orders: [], inventory_logs: [], payment_transactions: [], refund_records: [], operation_logs: [], addresses: [],
    pickup_points: [{ _id: 'pt_sz_001', name: '深圳大学城校园自提站', address: '南山区大学城学苑大道1088号', hours: '09:00-22:00', status: 'ACTIVE' }], address_meta: [], banners: []
  };
}
const initial = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : seedDemoData();
const db = createDb(initial, filename), runtime = loadRuntime(db);
const allowedOrigins = (process.env.ADMIN_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(',');
const publicActions = { products: ['list', 'recommend', 'detail', 'categories', 'banners'], pickupPoints: ['list'], adminAuth: ['login'] };
const blocked = ['paymentCallback', 'orderTimeoutJob'];
const rates = new Map();
const server = http.createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  const reject = (status, code, message) => reply(status, { success: false, code, message });
  try {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) return reject(403, 'ORIGIN_DENIED', '来源不允许');
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const requestedName = new URL(req.url, 'http://localhost').pathname.slice(1);
    const name = requestedName.replace(/^api\//, '');
    if (name === 'health') return reply(200, { success: true, data: { env: 'LOCAL_SIMULATOR', status: 'ready', testPayments: true } });
    if (req.method !== 'POST') return reject(405, 'METHOD_NOT_ALLOWED', '仅支持POST');
    if (blocked.includes(name) || (!runtime.names.includes(name) && name !== 'localSession')) return reject(404, 'NOT_FOUND', '接口不存在');
    const rateKey = `${req.socket.remoteAddress}:${name}`, now = Date.now(), previous = rates.get(rateKey);
    const limit = name === 'adminAuth' ? 60 : 600;
    const rate = previous && previous.until > now ? previous : { n: 0, until: now + 60000 }; rate.n++; rates.set(rateKey, rate);
    if (rate.n > limit) return reject(429, 'RATE_LIMITED', '请求过于频繁');
    let buffer = '', size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 256 * 1024) return reject(413, 'PAYLOAD_TOO_LARGE', '请求过大'); buffer += chunk.toString(); }
    let body; try { body = JSON.parse(buffer || '{}'); } catch { return reject(400, 'INVALID_PARAMS', 'JSON格式无效'); }
    if (name === 'localSession') {
      const token = crypto.randomBytes(32).toString('base64url');
      await db.collection('local_sessions').doc(crypto.createHash('sha256').update(token).digest('hex')).set({ data: { userId: `local_${crypto.randomUUID()}`, expiresAt: now + 7 * 86400000 } });
      return reply(200, { success: true, data: { token } });
    }
    const params = body.params || body.data;
    if (typeof body.action !== 'string' || !params || typeof params !== 'object' || Array.isArray(params)) return reject(400, 'INVALID_PARAMS', '请求格式无效');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const context = {};
    if (['auth', 'cart', 'orders', 'addresses', 'payment'].includes(name)) {
      const session = token ? (await db.collection('local_sessions').doc(crypto.createHash('sha256').update(token).digest('hex')).get()).data : null;
      if (!session || session.expiresAt <= now) return reject(401, 'AUTH_REQUIRED', '本地测试会话失效');
      context.OPENID = session.userId; context.SOURCE = 'wx_client';
    } else if (!publicActions[name]?.includes(body.action) && !token) return reject(401, 'AUTH_REQUIRED', '请先登录');
    const result = await runtime.call(name, { action: body.action, params, headers: { authorization: req.headers.authorization || '' } }, context);
    const status = result.success ? 200 : result.code === 'RATE_LIMITED' ? 429 : ['AUTH_REQUIRED', 'ADMIN_REQUIRED', 'AUTH_FAILED'].includes(result.code) ? 401 : result.code === 'DB_NOT_READY' ? 503 : result.code === 'PERMISSION_DENIED' ? 403 : result.code === 'ACTION_NOT_FOUND' ? 404 : 400;
    reply(status, result);
  } catch (e) { console.error('[local-gateway]', e.code || e.name); reject(500, 'SYSTEM_ERROR', '服务暂时不可用'); }
});
server.requestTimeout = 15000; server.headersTimeout = 10000;
server.listen(Number(process.env.LOCAL_ADMIN_PORT || 3001), '127.0.0.1', () => console.log(`Isolated gateway ready on 127.0.0.1:${server.address().port}; credentials saved locally at ${credentialsPath}`));
