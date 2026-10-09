# 单商户数据库结构（实施版）

唯一结构清单为 `cloudfunctions/common/schema.js`；`scripts/init-db.js` 与隔离测试初始化函数共用它。共 25 个集合。所有集合客户端读写规则均为 `false`；用户通过验证 OPENID 的云函数，管理端通过验证 JWT 和活动 SUPER_ADMIN 的云函数访问。控制台必须实际设置规则和索引，导出清单不等于创建完成。

| 集合 | 用途 | 索引 |
| --- | --- | --- |
| `users` | 终端微信用户表 | `idx_openid` {"_openid":1} UNIQUE<br>`idx_phone` {"phone":1}<br>`idx_created_at` {"createdAt":-1} |
| `admins` | 系统管理员账号表 | `idx_username` {"username":1} UNIQUE<br>`idx_role` {"role":1}<br>`idx_status` {"status":1} |
| `auth_limits` | 管理员登录限流计数（服务端私有） | `idx_reset_at` {"resetAt":1} |
| `products` | 商品核心SPU表 | `idx_status` {"status":1}<br>`idx_category_id` {"categoryId":1}<br>`idx_sort_created` {"sort":-1,"createdAt":-1}<br>`idx_sales` {"sales":-1} |
| `product_skus` | 商品SKU规格独立表 | `idx_product_id` {"productId":1}<br>`idx_sku_code` {"skuCode":1} UNIQUE<br>`idx_sku_status` {"status":1} |
| `categories` | 商品分类表（一级/二级两级词条） | `idx_parent` {"parentId":1}<br>`idx_sort` {"sort":-1}<br>`idx_status` {"status":1} |
| `carts` | 用户购物车表 | `idx_user_id` {"userId":1}<br>`idx_user_sku` {"userId":1,"skuId":1}<br>`user_created` {"userId":1,"createdAt":-1} |
| `orders` | 单商户交易与快递履约订单 | `idx_order_no` {"orderNo":1} UNIQUE<br>`idx_user_status` {"userId":1,"status":1}<br>`idx_created_at` {"createdAt":-1}<br>`idx_expiry` {"status":1,"expireAt":1}<br>`idx_shipping_retry` {"wxShippingSync.status":1,"wxShippingSync.nextRetryAt":1}<br>`shipping_checked` {"status":1,"wxCheckedAt":1}<br>`buyer_created` {"userId":1,"createdAt":-1}<br>`buyer_status_created` {"userId":1,"status":1,"createdAt":-1} |
| `order_items` | 订单商品明细快照表 | `idx_order_id` {"orderId":1}<br>`idx_product_id` {"productId":1} |
| `payment_transactions` | 微信支付交易账单流水表 | `idx_out_trade_no` {"outTradeNo":1} UNIQUE<br>`idx_order_id` {"orderId":1}<br>`idx_user_id` {"userId":1}<br>`idx_created_at` {"createdAt":-1} |
| `refund_records` | 整单退款申请与现金/额度流水 | `idx_out_refund_no` {"outRefundNo":1} UNIQUE<br>`idx_order_id` {"orderId":1}<br>`idx_created_at` {"createdAt":-1}<br>`refund_reconcile` {"status":1,"isTest":1,"lastCheckedAt":1} |
| `activation_codes` | 卡密兑换码（激活码）主表 | `idx_code` {"code":1} UNIQUE<br>`idx_status` {"status":1}<br>`idx_type_status` {"type":1,"status":1}<br>`idx_type_value` {"type":1,"value":1}<br>`idx_type_expire_at` {"type":1,"expireAt":1}<br>`idx_type_created_at` {"type":1,"createdAt":-1}<br>`idx_type_status_expire_at` {"type":1,"status":1,"expireAt":1} |
| `activation_records` | 卡密兑换流水记录表 | `idx_user` {"userId":1}<br>`idx_code` {"code":1} |
| `addresses` | 收货地址簿 | `idx_user_default` {"userId":1,"isDefault":1}<br>`user_updated` {"userId":1,"updatedAt":-1} |
| `address_meta` | 用户默认地址指针（按 OPENID 建立） |  |
| `favorites` | 心愿单收藏表 | `idx_user_product` {"userId":1,"productId":1} UNIQUE |
| `coupons` | 优惠券定义表 | `idx_status_valid` {"status":1,"validTo":1} |
| `user_coupons` | 用户领券核销表 | `idx_user_coupon` {"userId":1,"couponId":1,"status":1} |
| `banners` | 首页轮播广告位 | `idx_sort_status` {"sort":-1,"status":1} |
| `operation_logs` | 后台管理员操作审计日志表 | `idx_admin_action` {"adminId":1,"action":1}<br>`idx_created_at` {"createdAt":-1} |
| `balance_transactions` | 购物额度扣减与返还流水 | `idx_business_key` {"businessKey":1} UNIQUE<br>`idx_user_created` {"userId":1,"createdAt":-1} |
| `wechat_events` | 已验证微信事件接收与幂等处理 | `idx_state_created` {"status":1,"createdAt":1} |
| `ad_configs` | 广告配置（首发禁用） |  |
| `ad_reward_records` | 广告奖励审计 |  |
| `content_reviews` | 微信异步图片审核任务 | `traceId` {"traceId":1}<br>`entity_version` {"entityType":1,"entityId":1,"version":1}<br>`queue` {"status":1,"createdAt":1} |

## orders：唯一交易与履约主表

- `_id`：买家身份与必填 `requestId` 的摘要；`requestFingerprint` 约束同标识相同有效输入。重复请求返回原订单。
- `orderNo`：32字符内，支付与发货使用的商户订单号；`userId` 是服务端微信身份。
- `items`：SKU 服务端查询形成名称、图片、规格、单价分、数量和小计快照。
- `totalAmount`、`balanceAmount`、`payAmount` 全是非负安全整数分，`totalAmount = balanceAmount + payAmount`；当前运费为0，不接受客户端单价。
- `shippingAddress`：下单时验证并固化的快递收货地址；没有库存、商户隔离、自提、抽成或子单字段。
- `paymentInitiated`、`paymentCreatingUntil`：支付创建先持久化60秒互斥租约；外部请求超时保持可查状态，不假装失败或已取消。
- `paymentTradeNo`：验签支付凭证的微信交易号；全额度单使用内部 BALANCE_ 标识，不调用微信发货管理。
- `shipments`、`trackingNo`、`expressCompany`：目前管理端一次整单发货、一个真实快递包裹。
- `wxShippingSync`：pending/uploading/synced/uncertain/conflict/not_required；超时先查微信，再决定重试，冲突保留人工核查。
- `refundNo`、`refundAttempt`：关联整单退款记录；不将用户点退款直接视为成功。

状态：`PENDING_PAYMENT → PAID → SHIPPED → COMPLETED`；取消 `PENDING_PAYMENT → CLOSING → CANCELLED`。支付成功证据可将 CLOSING 改为 PAID。PAID/SHIPPED 可申请 `REFUND_PENDING → REFUNDING → REFUNDED`；拒绝待审核申请恢复申请前状态。已发货退款须管理员明确确认退货。完成订单不开放自动退款。

## 金额流水与事务

`balance_transactions` 记录 businessKey、userId、orderId、amount、before、after，按业务键幂等；下单额度扣减、取消返还、退款成功返还和卡密兑换分别在同一数据库事务内完成。`payment_transactions` 记录支付成功证据，交易号不能绑定两张订单。`refund_records` 的 totalFee/refundFee 为微信现金分，balanceFee 为购物额度分；仅官方 SUCCESS 或合法全额度内部证据可完成退款。CLOSED/ABNORMAL 保持人工核对，不能点击改成成功。

## 内容安全和审计

商品每次变更创建新的 contentSafety.version 并下架；文字审核通过后提交图片异步任务。`content_reviews` 每个资源一个槽位和 traceId，只有当前版本所有图片 PASS 才允许上架。回调与重复事件留存 `wechat_events`；不落库原始密钥、支付回调全文或额外收货个人信息。

数据库原子性和唯一索引还需 CloudBase 真实环境验收；本地适配器覆盖应用逻辑，不替代云数据库能力。
