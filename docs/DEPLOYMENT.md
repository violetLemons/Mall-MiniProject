# 通用商城 · 微信小程序商城全栈生产级部署上线手册 (DEPLOYMENT.md)

> **版本**：v2.1.0 (CloudBase 事务与网关整改版)
> **适用范围**：微信原生小程序 + PC 管理后台 (React 18 + Vite) + CloudBase 微信云开发服务端  
> **安全等级**：事务级库存一致性 + scrypt/PBKDF2 兼容鉴权 + 零信任客户端定价 + 微信官方 CloudPay 网关双重查验

---

## 目录索引
- [一、准备工作与账号前置要求](#一准备工作与账号前置要求)
- [二、生产级部署 17 步标准 SOP](#二生产级部署-17-步标准-sop)
  - [步骤 1：创建微信云开发环境](#步骤-1创建微信云开发环境)
  - [步骤 2：数据库 20 个集合与复合索引清单](#步骤-2数据库-20-个集合与复合索引清单)
  - [步骤 3：超级管理员种子安全账号生成](#步骤-3超级管理员种子安全账号生成)
  - [步骤 4：云函数依赖打包与公共模块同步](#步骤-4云函数依赖打包与公共模块同步)
  - [步骤 5：部署 17/18 个云函数与定时触发器](#步骤-5部署-1718-个云函数与定时触发器)
  - [步骤 6：配置数据库细粒度安全访问规则 (Security Rules)](#步骤-6配置数据库细粒度安全访问规则-security-rules)
  - [步骤 7：小程序项目配置与 AppID 绑定](#步骤-7小程序项目配置与-appid-绑定)
  - [步骤 8：小程序端云环境通信桥接与防腐配置](#步骤-8小程序端云环境通信桥接与防腐配置)
  - [步骤 9：小程序端编译、本地构建与真机体验版发布](#步骤-9小程序端编译本地构建与真机体验版发布)
  - [步骤 10：PC 管理后台依赖安装与环境变量配置](#步骤-10pc-管理后台依赖安装与环境变量配置)
  - [步骤 11：PC 管理后台生产构建与产物校验](#步骤-11pc-管理后台生产构建与产物校验)
  - [步骤 12：PC 管理后台部署至云开发静态网站托管](#步骤-12pc-管理后台部署至云开发静态网站托管)
  - [步骤 13：微信官方 CloudPay 支付接口配置与发货信息管理规范](#步骤-13微信官方-cloudpay-支付接口配置与发货信息管理规范)
  - [步骤 14：校园自提服务站配置与 6 位提货码核销联调](#步骤-14校园自提服务站配置与-6-位提货码核销联调)
  - [步骤 15：多角色 RBAC 运营账号开通与分权](#步骤-15多角色-rbac-运营账号开通与分权)
  - [步骤 16：执行全量生产级安全与业务自动化测试套件](#步骤-16执行全量生产级安全与业务自动化测试套件)
  - [步骤 17：正式提交微信审核与全网灰度发布](#步骤-17正式提交微信审核与全网灰度发布)
- [三、运维排错与应急回滚指南](#三运维排错与应急回滚指南)

---

## 一、准备工作与账号前置要求

1. **微信小程序官方账号**：登录 [微信公众平台 (mp.weixin.qq.com)](https://mp.weixin.qq.com)，获取 AppID（需已认证且开通“云开发”功能）。本次开发者工具项目 AppID 为 `wxYOUR_MINIPROGRAM_APPID`，请以工具当前显示值为准。
2. **微信支付商户平台账号**：微信支付商户号（MCH ID），与小程序 AppID 完成绑定。
3. **开发工具与运行时环境**：
   - Node.js `v18.0.0+` 或 `v20.0.0+` (推荐 LTS)
   - 微信开发者工具 (最新 Stable 版本)
   - npm 或 pnpm 包管理器

---

## 二、生产级部署 17 步标准 SOP

### 步骤 1：创建微信云开发环境
1. 打开微信开发者工具，点击顶部工具栏的 **「云开发」** 按钮。本项目已确认环境 `YOUR_CLOUDBASE_ENV_ID`，部署前仍需确认其用途并保留现有数据。
2. 首次进入点击“开通云开发”，选择计费模式（基础版或按量付费）。
3. 记录生成的 **环境 ID (Env ID)**，例如：`mall-prod-7g81x`。

---

### 步骤 2：数据库 20 个集合与复合索引清单
本项目提供了可重复输出数据库结构清单的脚本 `scripts/init-db.js`。
1. 在微信开发者工具中打开项目。
2. 进入「云开发控制台」 -> 「数据库」，确认当前环境。
3. 在项目根目录执行：
```powershell
node scripts/init-db.js
node scripts/init-db.js --json work/cloud-seed/database-manifest.json
node scripts/export-cloud-seed.js --out work/cloud-seed
```
微信开发者工具 CLI 当前不提供数据库 DDL 接口，该脚本只输出可审计的集合、索引与权限清单，不会伪装执行云端写入。请在 CloudBase 控制台按清单创建或核对 20 个集合、索引和安全规则，再读取结果留档。请以 `work/cloud-seed/database-manifest.json` 和 `scripts/init-db.js` 输出为准创建索引；不要按旧文档中的历史集合名批量创建，以免产生无用或错误索引。

---

### 步骤 3：超级管理员种子安全账号生成
为保障管理后台绝对安全，系统杜绝明文或弱密码，采用 **scrypt + 32字节强随机盐**；旧 PBKDF2 哈希只用于兼容校验并在登录后升级。
执行预置种子脚本：
```bash
node scripts/seed-admin.js
```
执行后控制台输出：
```text
[Seed] Admin user 'superadmin' generated successfully.
Initial Credentials:
  Username: superadmin
  Password: <控制台安全打印或由 INITIAL_ADMIN_PASSWORD 环境变量注入>
  Salt: 32-byte hex generated
  Iterations: 10000
```
> [!IMPORTANT]
> 首次登录管理后台后，请立即进入「管理员权限」修改超级管理员密码！当前服务端优先使用 scrypt，仍可校验旧 PBKDF2 哈希并在登录时升级。严禁使用弱口令！

---

### 步骤 4：云函数依赖打包与公共模块同步
微信云开发各云函数在独立上传时要求自身具备完整的模块。本项目提供了专属打包同步脚本 `scripts/bundle-functions.js`，将 `cloudfunctions/common/` 自动同步至全部云函数中：
```bash
node scripts/bundle-functions.js
```
控制台将提示 18 个云函数已成功注入公共核心：
- `response.js`：统一 API 响应信封规范
- `crypto.js`：scrypt/PBKDF2 兼容密码校验与防篡改 Token 签发 (timingSafeEqual)
- `authMiddleware.js`：零信任管理员 RBAC 鉴权与 HTTP 网关报文解析
- `orderPayConfirm.js`：微信商城核心 CAS 幂等支付确认与销库存事务引擎
- `logger.js`：操作行为入库审计引擎

---

### 步骤 5：部署 17/18 个云函数与定时触发器
在微信开发者工具中，展开 `cloudfunctions/` 目录：
对以下每一个云函数目录右键，选择 **「上传并部署：云端安装依赖 (不上传 node_modules)」**。也可以使用 `scripts/deploy-cloud.ps1` 先同步公共模块后通过 CLI 增量部署；脚本默认部署生产所需的 17 个函数，只有隔离云测试环境才追加 `-IncludeTestPayment`：
```powershell
# 生产或真实支付环境（不部署测试支付入口）
powershell -File scripts/deploy-cloud.ps1 -EnvId <环境ID>

# 隔离云测试环境（显式加入测试付款/退款入口）
powershell -File scripts/deploy-cloud.ps1 -EnvId <环境ID> -IncludeTestPayment
```
1. `adminAuth`：后台管理员账号登录、scrypt 加盐哈希鉴权与 JWT 签发
2. `adminProducts`：商品库维护、35~45 码 SKU 规格矩阵调控、上架/下架与软删除
3. `adminInventory`：库存精确手动调账与出入库变动流水审计
4. `adminOrders`：订单履约发货（顺丰/中通）、物流单号录入与自提核销
5. `adminCategories`：商品潮流类目管理
6. `adminBanners`：首页运营轮播图配置
7. `adminUsers`：后台多角色 RBAC 权限管理与操作审计日志查询
8. `auth`：微信用户静默登录与个人信息维护
9. `products`：小程序端商品瀑布流、分类筛选、品牌搜索与 2D SKU 矩阵聚合
10. `cart`：购物车列表、批量勾选与下单前物理可用库存校验
11. `orders`：生产级原子下单（全链路整型分计算、1~5件限购、地址规范校验、原子扣减可用库存并增加锁存）与主动取消
12. `payment`：微信官方 CloudPay 统一下单预支付凭证生成、退款申请受理与主动网关查单
13. `paymentCallback`：微信官方 CloudPay 支付成功回调安全处理器（严格拦截客户端直接调用，微信网关二次反查查单确认交易状态、商户号、AppID、订单号、金额、买家OpenID，CAS 原子确认流转并正式销存）
14. `orderTimeoutJob`：超时未支付订单自动关单定时器
15. `adminGateway`：浏览器管理后台 HTTPS 入口，仅转发管理员函数并执行来源白名单校验
16. `addresses`：用户地址簿，服务端校验归属与默认地址
17. `pickupPoints`：校园自提点查询与管理
18. `testPayment`：仅测试环境授权管理员可用的隔离付款确认

#### 定时触发器配置 (`orderTimeoutJob/config.json`)
确保 `cloudfunctions/orderTimeoutJob/config.json` 包含以下定时触发规则，并右键点击 **「上传触发器」**：
```json
{
  "triggers": [
    {
      "name": "orderTimeoutJobTrigger",
      "type": "timer",
      "config": "0 */5 * * * * *"
    }
  ]
}
```
该任务每 5 分钟自动扫描 30 分钟未付款的订单，执行微信支付关单并将锁存库存全量释放回原 SKU。

---

### 步骤 6：配置数据库细粒度安全访问规则 (Security Rules)
为防止小程序前端越级非法改动商品价格或库存，核心业务表必须启用服务端受限访问规则：
在云开发控制台 -> 数据库 -> 选择集合 -> 「权限设置」：
- `products` / `product_skus`: **所有用户可读，仅管理端云函数可写**
  ```json
  { "read": true, "write": false }
  ```
- `orders`: **仅创建者可读，仅云函数可写**
  ```json
  { "read": "doc._openid == auth.openid", "write": false }
  ```
- `admins` / `inventory_logs` / `payment_transactions` / `refund_records` / `operation_logs`: **完全私有，前端不可读写**
  ```json
  { "read": false, "write": false }
  ```

---

### 步骤 7：小程序项目配置与 AppID 绑定
1. 打开 `project.config.json`，确保配置如下：
```json
{
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "appid": "wxYOUR_MINIPROGRAM_APPID",
  "projectname": "wechat-sneaker-mall"
}
```
2. 开发者工具左上角确认显示当前真实 AppID。

---

### 步骤 8：小程序端云环境通信桥接与防腐配置
打开 `miniprogram/services/cloud.ts`：
```typescript
// 本次开发者工具已确认的云环境 ID
export const CLOUD_ENV_ID = 'YOUR_CLOUDBASE_ENV_ID';
```
> [!NOTE]
> 商品、购物车、地址和订单请求全程直连微信云开发网关，不再从云调用失败回退 Mock。隔离的 `testPayment` 入口仅在 `APP_ENV=cloud-test`、`PAYMENT_MODE=test` 且显式开启时可用，正式构建不得配置这些开关。

---

### 步骤 9：小程序端编译、本地构建与真机体验版发布
1. 在项目根目录下执行 TypeScript 编译：
```bash
npm run build
```
2. 在微信开发者工具中点击 **「编译」**，验证控制台无报错。
3. 点击工具栏 **「真机调试」** 或 **「预览」**，使用手机微信扫码测试全流程。
4. 点击工具栏 **「上传」**，填写测试版本号，项目备注填写“CloudBase 测试验收版”。
5. 在公众平台「版本管理」中将其设为 **「体验版」** 进行最终业务验收。

---

### 步骤 10：PC 管理后台依赖安装与环境变量配置
进入 `admin-web/` 目录：
```bash
cd admin-web
npm install
```
检查并配置 `.env.production` 文件（可参考 `.env.example`）：
```env
VITE_APP_TITLE=通用商城管理控制台
VITE_CLOUDBASE_URL=https://<你的云开发环境域名或自定义HTTP网关>
```
> [!CAUTION]
> 生产模式严禁在未配置 `VITE_CLOUDBASE_URL` 时启动，前端已内建安全网关阻断逻辑，缺少真实接口地址将直接抛出安全异常并拒绝进入后台。

---

### 步骤 11：PC 管理后台生产构建与产物校验
在 `admin-web/` 目录下执行打包：
```bash
npm run build
```
构建产物输出至 `admin-web/dist/`，配置已强制设置 `build.sourcemap: false`，杜绝源码泄露。

---

### 步骤 12：PC 管理后台部署至云开发静态网站托管
1. 打开微信开发者工具 -> 「云开发控制台」 -> 「更多」 -> **「静态网站托管」**。
2. 将 `admin-web/dist/` 下的全部文件上传至静态网站根目录 `/`。
3. 在「配置设置」中设置默认首页为 `index.html`，错误页面为 `index.html`（SPA 路由支持）。
4. 打开浏览器访问分配的静态网站域名，使用初始超级管理员账号登录后台。

---

### 步骤 13：微信官方 CloudPay 支付接口配置与发货信息管理规范
1. 在微信开发者工具 -> 云开发控制台 -> 「设置」 -> 「拓展功能」中开通 **「微信支付」** 绑定。
2. 绑定已通过审核的微信支付商户号 (`WECHAT_PAY_MCH_ID`)。
   商户管理员还需在“服务商助手”确认授权，并在微信支付商户平台开通小程序/JSAPI 支付；进行退款验收时同时开通退款权限。CloudBase 显示“已绑定/已授权”后，才进行真机支付验证。
3. **统一下单调用规范**：
   系统在 `cloudfunctions/payment/index.js` 中使用微信云开发原生官方能力：
   ```javascript
   const res = await cloud.cloudPay.unifiedOrder({
     body: `通用商城 - ${order.orderNo}`,
     outTradeNo: order.orderNo,
     spbillCreateIp: '127.0.0.1',
     subMchId: process.env.WECHAT_PAY_SUB_MCH_ID || process.env.WECHAT_PAY_MCH_ID,
     subAppid: process.env.WECHAT_APP_ID,
     totalFee: order.payAmount, // 数据库整型分 (¥699 对应 69900)
     envId: process.env.CLOUDBASE_ENV_ID,
     functionName: 'paymentCallback' // 支付成功回调云函数
   });
   ```
   当前实现通过 CloudBase 云调用完成签名、证书和回调验签；不要把商户私钥、API v3 密钥或证书上传到代码仓库。若改用直连微信支付 API v3，需另行配置商户证书序列号、私钥、平台证书/公钥、API v3 密钥和可公网访问的通知地址。
4. **微信小程序发货信息管理接口规范**：
   针对实物商品交易，根据微信官方合规要求，商家发货后需通过微信小程序发货信息管理接口（或云开发官方插件）上报物流信息。已在 `cloudfunctions/adminOrders/index.js` 的 `ship` 指令中集成标准发货信息上报框架，支持顺丰、中通等合规物流公司编码及单号录入。

---

### 步骤 14：校园自提服务站配置与 6 位提货码核销联调
1. 登录 PC 管理后台 -> 「订单管理」。
2. 小程序端选择“校园自提”提交订单并完成支付。
3. 商家在后台点击 **「备货完毕」**，订单状态流转为 `READY_FOR_PICKUP`。
4. 买家出示小程序中的 6 位数字自提码。
5. 站点管理员在管理后台点击 **「自提核销」**，输入 6 位验证码：
   - 输错：拦截并提示“取货码不正确”
   - 输对：订单状态原子流转为 `COMPLETED`，记录核销时间与操作人。

---

### 步骤 15：多角色 RBAC 运营账号开通与分权
使用 `superadmin` 登录后台 -> 点击左侧「管理员权限」：
1. **运营人员账号**（`OPERATOR`）：分配商品上下架、订单发货权限，无权物理销毁商品与修改管理员。
2. **仓库自提专员账号**（`WAREHOUSE`）：分配库存流水调拨、自提码核销权限。
3. 遵循最小权限原则，禁止将 `SUPER_ADMIN` 账号分配给非核心技术人员。

---

### 步骤 16：执行全量生产级安全与业务自动化测试套件
在正式上线前，必须在项目根目录下执行全量自动化安全验证：
```bash
node scripts/run-tests.js
```
验证全部 35 项核心用例 100% 成功通过：
- [x] **Case 01~03**：缺少 JWT 密钥拦截、Token 防篡改时序比对、PBKDF2 10000 次加盐哈希
- [x] **Case 04~06**：未登录拦截、正则转义防注入、2D SKU 矩阵与可用库存计算
- [x] **Case 07~12**：下单整型分存储(¥699->69900)、防小数/负数/超限购攻击、缺货回滚、IDOR越权拦截、主动关单恢复库存
- [x] **Case 13~14**：createPayment 强校验、彻底删除前端直改 PAID 后门
- [x] **Case 15~16**：伪造回调全面防御（直调拦截/网关查单失败/1分钱金额篡改/买家不匹配/AppID不匹配全部阻断）、官方可信回调原子销存
- [x] **Case 17~19**：回调与查单并发时 CAS 保证库存只扣减一次、异常半完成订单要求重新对账、取消与支付并发绝不取消已付款订单
- [x] **Case 20~21**：已支付订单取消必须走退款(PAID->REFUNDING)且确认前不释放库存、定时轮询关单
- [x] **Case 22~24**：未支付自提订单不可备货/不可核销、已支付自提凭 6 位码安全核销
- [x] **Case 25**：生产模式无后台接口地址时拒绝启动、前端零本地沙箱凭证与零弱口令后门

---

### 步骤 17：正式提交微信审核与全网灰度发布
1. 登录 [微信公众平台 (mp.weixin.qq.com)](https://mp.weixin.qq.com)。
2. 在「版本管理」中找到已上传的开发版本，点击 **「提交审核」**。
3. 填写服务类目（服装/百货/箱包），提交小程序用户隐私保护指引。
4. 审核通过后，点击 **「发布」**，建议选择渐进式灰度发布策略（10% -> 30% -> 100%）。
5. 通用商城微信小程序商城正式上线运营！

---

## 三、运维排错与应急回滚指南

| 常见异常场景 | 风险级别 | 排查方向 | 应急处置方案 |
| :--- | :--- | :--- | :--- |
| **小程序提示“云函数调用失败”** | P1 | 云环境 ID 未配置或云函数未部署 | 检查 `miniprogram/services/cloud.ts` 中的 `CLOUD_ENV_ID`；确认微信开发者工具中云函数已全量上传。 |
| **PC 后台提示“未配置 VITE_CLOUDBASE_URL”** | P0 | 前端生产安全熔断保护生效 | 属于正常安全防护。检查 `.env.production` 中是否配置了真实的 CloudBase HTTP 触发网关地址。 |
| **买家支付成功但页面提示“支付处理中”** | P2 | 微信支付回调延迟 | 买家退出订单页面重新进入即可，详情接口内置微信官方二次查单，若已付款将自动同步为 `PAID`。 |
| **提货码提示核销码不匹配** | P2 | 提货码输入错误或买家订单未刷新 | 请买家出示订单详情页中展示的最新 6 位数字验证码，管理端核对是否含有多余空格。 |
| **商品无法物理清除** | P2 | 外键保护与历史账单关联 | 该商品存在历史关联订单，系统严格禁止物理清除，使用“软删除”移入回收站即可。 |

