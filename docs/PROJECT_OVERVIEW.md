# 项目全景与关键约定（AI 交接 / 审查速览）

> 本文件是给后续接手的 AI / 审查者的**快速上手地图**：架构拓扑、云函数职责、数据模型坑、鉴权、关键约定与当前状态。
> 权威细节另见：`README.md`、`docs/database-schema.md`、`docs/DEPLOYMENT.md`、`docs/已完成成果.md`。

---

## 1. 一句话定位

微信小程序电商商城模板：**Native 小程序 (TS) + 微信云开发 CloudBase 云函数 (Node.js) + React 18 管理后台**。
已接入真实微信云开发环境（个人版），微信支付 API v3、微信官方发货管理服务均真实打通。

## 2. 三端拓扑

| 端 | 目录 | 技术 | 运行/访问方式 |
| :--- | :--- | :--- | :--- |
| 小程序前端 | `miniprogram/` | Native WXML/WXSS + TypeScript（`compileType: "typescript"`） | 微信开发者工具编译；`wx.cloud.callFunction` 直调云函数 |
| 云函数后端 | `cloudfunctions/` | Node.js + `wx-server-sdk` + CloudBase NoSQL | 云端运行，`tcb fn deploy` 部署 |
| PC 管理后台 | `admin-web/` | React 18 + Vite + TS + react-router-dom + lucide-react | 浏览器端，通过 HTTP 网关调云函数（**不能用** wx.cloud.callFunction） |

- **环境**：env `cloud1-d3gffg6ok96e6cf3f`（ap-shanghai，个人版）。
- **小程序源码是 `.ts`**，`.js` 是开发者工具编译产物，**不要手改 `.js`**，只改 `.ts/.wxml/.wxss/.json`。
- 小程序上传由用户在微信开发者工具里点，不代传。

## 3. 云函数清单与职责

| 函数 | 职责 |
| :--- | :--- |
| `adminGateway` | **HTTP 网关**：admin-web 唯一入口，白名单 `ALLOWED_FUNCTIONS` 转发到各 admin 函数 |
| `adminAuth` | 后台登录、签发 JWT（HS256） |
| `adminUsers` | 后台账号管理 / 商户资料 / subMchId 加密存储 |
| `adminProducts` | 商品管理：图片上传、列表/详情、商家审核工单、SKU、上/下架 |
| `adminCategories` | 分类管理（一级/二级两级） |
| `adminBanners` | 首页轮播 / 活动专区 |
| `adminInventory` | 库存调整与出入库流水 |
| `adminOrders` | 后台订单：发货、退款审核、微信发货对账、自提核销 |
| `merchantAuth` | 商户小程序端登录（含 `devLogin` 绕过手机号授权） |
| `auth` | 买家登录（openid / 手机号），写 `users` 集合 |
| `products` | 买家端商品检索/详情 |
| `orders` | 买家下单/查询/取消（**自包含实现**，含拆 `merchant_orders`） |
| `payment` | 微信支付 v3 JSAPI 下单 / 0 金额直结 |
| `paymentCallback` | 微信支付异步回调：解密验签、入账、流转订单状态 |
| `orderTimeoutJob` | 定时器：超时关单、发货状态反向巡检 |
| `cart` / `addresses` / `pickupPoints` | 购物车 / 收货地址 / 自提点 |
| `activation` | 卡密兑换（`redeem` 写入 `users.balance` 购物额度） |
| `ads` | 激励视频广告得额度（config/reward/stats） |
| `initDb` | 初始化集合/索引/种子数据 |
| `testPayment` | 开发用测试支付 |
| `common/` | 共享底层库（response/authMiddleware/logger/commerce/wxOrderShippingService），由 `scripts/bundle-functions.js` 拷贝到各函数 |

## 4. 鉴权与角色（RBAC）

- **买家**：openid（`cloud.getWXContext()`），主体是 `users` 集合。
- **后台**：`admins` 集合，`role = SUPER_ADMIN | MERCHANT`；JWT 由 `adminAuth` 签发；`requireAdmin` 校验 token+版本；`requireSuperAdmin` 仅超管；`permissions` 数组做细粒度 RBAC（`*` 通配）。
- **商户隔离**：MERCHANT 账号带 `merchantId`，只能看/改归属自己的商品与订单。
- **商户小程序端**：`merchantAuth`，原手机号登录已失效，改用 `devLogin(username)` 绕过（**上线前必须移除**）。
- **admin-web 测试账号**（用户确认不改）：
  - 平台超管 `superadmin` / `admin123456`
  - 商家 `merchant1` / `merchant123456`（merchantId=`m1`）
  - 后台地址：`https://cloud1-d3gffg6ok96e6cf3f-1493376073.tcloudbaseapp.com/`

## 5. 数据模型要点（坑，先看这里）

- **金额统一用整数「分」**，展示时才除 100。
- **订单双表**：`orders` = 隐形支付主单（对账/支付），`merchant_orders` = 按商家拆分的买家/商家可见子订单（独立履约/发货/退款）。下单时 `orders.create` 按商品 `merchantId` 拆子订单。
- **商品双表**：`products`(SPU) + `product_skus`(SKU)。**当前每商品一个隐藏默认 SKU**（`colorName=默认, size=1`），无多规格；`saveSkus` 自动生成；`updateSkus` 与种子里的多规格是**死代码**。
- **商家新增/改商品走审核工单** `product_audit_tickets`（PENDING→APPROVED/REJECTED），**不直接写 `products`**；平台审核通过才落库上架，可填 `platformFee` 抽成。
- **图片字段一律存永久 `fileID`（`cloud://`）**，不要存 `getTempFileURL` 的临时链接（`https://…tcb.qcloud.la/…`，约 2 小时过期导致破损）。后端展示时 `fileIDsToTempURLs` 实时转临时链接；`adminProducts.get` 返回 `coverFileID/imagesFileIDs/detailImagesFileIDs` 供编辑回填。`toFileID()` 反向重建脆弱，别依赖。
- **分类两级**：`categories.parentId` 空 = 一级，非空 = 二级。
- **购物额度 `users.balance`**：由 `activation.redeem`（卡密）写入；看广告得额度（`ads`）与下单余额抵扣的历史状态是「额度只进不出、缺下单抵扣」，具体落地以代码为准。

## 6. 关键约定与踩坑（部署/工程）

- 改了 `cloudfunctions/common/` 后必须 `node scripts/bundle-functions.js` 再部署，否则云端 `Cannot find module './common/...'`。
- `tcb fn deploy` **必须加 `--install-dependency true`**，否则云端丢 `wx-server-sdk`（本地函数目录无 node_modules）。
- 静态托管部署**不要加 `--prune`**（会误删远程 `__auth/*` 认证文件）。
- 部署不在 `cloudbaserc.json` 里的函数会触发交互式确认（后台 bash 直接 exit 1）；先把函数名+timeout 写进 `cloudbaserc.json`。
- `config.json` 的 `timeout / triggers / permissions.openapi` **CLI 不能一次全应用**；`openapi` 云调用权限只能在微信开发者工具里右键「上传并部署」。
- 云调用发货接口名是 `wxa.sec.order.*`（camelCase），不是 `tradeManaged.*`。
- Git：GitHub HTTPS 被墙，已改用 SSH remote。

## 7. 当前开发状态

- **未上线**；个人认证（非企业）接口受限，拿到企业账号前尽量跑通本地逻辑。
- `devLogin` 上线前须移除。
- 广告/流量主：上线后 UV>500 才开通；广告走微信智能接入、不手写激励视频代码逻辑（`adUnitId` 占位）。

## 8. 权威文档索引

- `README.md` — 功能全景、技术栈、7 步部署、发货对账时序
- `docs/database-schema.md` — 集合字段结构 + 索引清单
- `docs/DEPLOYMENT.md` — 云开发迁移与部署手册
- `docs/已完成成果.md` — 已落地成果清单
- `docs/小程序修改计划书.md` — 小程序改造计划
