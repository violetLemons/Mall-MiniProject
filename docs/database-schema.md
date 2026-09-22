# CloudBase 云数据库 Schema 与权限设计规范

本项目基于腾讯云开发（CloudBase）NoSQL 文档型数据库设计，遵循高并发电商系统的数据一致性与读写分离隔离规范。

---

## 一、核心数据集合清单 (Collections)

| 集合名称 (Collection) | 业务说明 | 权限推荐策略 | 读写主要入口 |
| :--- | :--- | :--- | :--- |
| **`users`** | 买家微信用户资料与手机号 | 仅创建者可读写 | `auth` 云函数 |
| **`admins`** | PC 后台管理员账号及权限 (scrypt 加密) | 所有用户不可访问 (私有) | `adminAuth` 云函数 |
| **`products`** | 商品 SPU 基础信息与销售状态 | 所有用户可读，仅管理端可写 | `products`, `adminProducts` |
| **`product_skus`** | 商品 SKU 规格、多规格与独立库存表 | 所有用户可读，仅事务云函数可写 | `products`, `adminInventory` |
| **`categories`** | 商品分类层级与排序（一级/二级两级词条） | 所有用户可读，仅管理端可写 | `products`, `adminCategories` |
| **`banners`** | 首页顶部轮播大图与活动专区卡片 | 所有用户可读，仅管理端可写 | `products`, `adminBanners` |
| **`pickup_points`** | 线下门店与校园自提网点 | 所有用户可读，仅管理端可写 | `pickupPoints` |
| **`carts`** | 用户购物车条目 | 仅创建者可读写 | `cart` 云函数 |
| **`addresses`** | 用户收货地址列表 | 仅创建者可读写 | `addresses` 云函数 |
| **`orders`** | 核心交易订单主表 | 仅创建者可读写 (私有更佳) | `orders`, `adminOrders` |
| **`order_items`** | 订单商品快照子表 | 仅创建者可读写 (私有更佳) | `orders` 云函数 |
| **`merchant_orders`** | 商家子订单表（按商品拆分，合并支付下独立履约/发货/退款） | 所有用户不可访问 (私有) | `orders`, `adminOrders` |
| **`payment_transactions`** | 微信支付 API v3 交易记录流水表 | 所有用户不可访问 (私有) | `payment`, `paymentCallback` |
| **`refund_records`** | 退款申请与流水记录表（按子订单整单退） | 所有用户不可访问 (私有) | `payment`, `adminOrders` |
| **`activation_codes`** | 卡密兑换码（激活码）主表 | 所有用户不可访问 (私有) | `activation` 云函数 |
| **`activation_records`** | 卡密兑换流水记录表 | 所有用户不可访问 (私有) | `activation` 云函数 |
| **`inventory_logs`** | 库存变更与补货出入库流水 | 所有用户不可访问 (私有) | `adminInventory` |
| **`operation_logs`** | 管理员操作审计流水日志 | 所有用户不可访问 (私有) | `adminGateway` |

---

## 二、集合字段结构说明

### 1. 订单主表 (`orders`)
```json
{
  "_id": "order_66f001_xxxx",
  "orderNo": "SL1789000000001",
  "userId": "oUpF8u_demo_user_openid",
  "deliveryType": "DELIVERY", // DELIVERY: 快递配送, PICKUP: 到店自提
  "status": "PAID", // PENDING_PAYMENT | PAID | SHIPPED | WAITING_PICKUP | READY_FOR_PICKUP | COMPLETED | CANCELLED
  "totalAmount": 19900, // 分为单位
  "payAmount": 19900,
  "shippingAddress": {
    "name": "张三",
    "phone": "13800000000",
    "province": "福建省",
    "city": "示例市",
    "district": "示例区",
    "detail": "示例大学1号楼"
  },
  "pickupInfo": {
    "pointId": "pt_sz_001",
    "pointName": "示例大学潮流自提站",
    "pickupStatus": "READY"
  },
  "logisticsCompany": "极速快递",
  "expressCompany": "SF",
  "trackingNo": "SF1234567890",
  "shippedAt": "2026-09-10T12:00:00.000Z",
  "wxShippingSync": {
    "status": "synced", // synced | failed | conflict
    "source": "mall", // mall | wechat | both
    "type": "EXPRESS", // EXPRESS | PICKUP
    "syncedAt": "2026-09-10T12:01:00.000Z"
  },
  "createdAt": "2026-09-10T11:50:00.000Z",
  "updatedAt": "2026-09-10T12:01:00.000Z"
}
```

### 2. 商品表 (`products`)
```json
{
  "_id": "prod_demo_001",
  "name": "Demo 经典基础款商品",
  "title": "Demo 经典基础款商品",
  "brand": "基础优选",
  "categoryId": "cat_002",
  "cover": "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800",
  "images": [
    "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800"
  ],
  "minPrice": 19900, // 分
  "maxPrice": 19900,
  "sales": 128,
  "totalStock": 50,
  "status": "ON_SALE", // ON_SALE | OFF_SALE
  "tags": ["新品", "极速发货"],
  "sort": 100,
  "merchantId": null // 商家归属：平台商品为空，商家商品=该商家 merchantId
}
```

### 3. SKU 表 (`product_skus`)
```json
{
  "_id": "sku_demo_001_42",
  "productId": "prod_demo_001",
  "skuCode": "SKU-DEMO-001-42",
  "colorName": "黑白经典",
  "colorImage": "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=400",
  "size": 42,
  "price": 19900,
  "stock": 50,
  "lockedStock": 0,
  "status": "ACTIVE"
}
```

### 4. 商家子订单表 (`merchant_orders`)
```json
{
  "_id": "mo_xxx",
  "merchantId": "m_001",
  "parentOrderId": "order_xxx",
  "parentOrderNo": "SL1789000000001",
  "subOrderNo": "MO1789000000001",
  "userId": "oUpF8u_demo_user_openid",
  "items": [
    {
      "productId": "prod_demo_001",
      "skuId": "sku_001_42",
      "productName": "Demo 经典基础款商品",
      "colorName": "经典黑",
      "size": 42,
      "image": "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=400",
      "unitPrice": 19900,
      "count": 2,
      "totalAmount": 39800,
      "merchantId": "m_001"
    }
  ],
  "totalAmount": 39800,
  "deliveryType": "DELIVERY",
  "shippingAddress": { "name": "张三", "phone": "13800000000" },
  "status": "PAID",
  "reviewed": false, // 买家是否已评价（区分「待评价 / 已完成」）
  "shipments": [
    { "trackingNo": "SF1234567890", "logisticsCompany": "极速快递", "expressCompany": "SF", "shippedAt": "2026-09-22T12:00:00.000Z" }
  ],
  "createdAt": "2026-09-22T11:50:00.000Z",
  "updatedAt": "2026-09-22T12:01:00.000Z"
}
```

### 5. 分类表 (`categories`)

> 分类支持「一级 / 二级」两级词条：左侧菜单显示一级（主要词条），右侧显示二级（次要词条），点击二级后才展示对应商品。

```json
{
  "_id": "cat_fruit_apple",
  "name": "苹果",
  "icon": "🍎",
  "badge": "热卖",
  "parentId": "cat_fruit", // 空字符串或不存在 = 一级分类；否则为所属一级分类 _id（二级分类）
  "sort": 100,
  "status": "ACTIVE"
}
```

### 6. 卡密兑换码表 (`activation_codes`)

```json
{
  "_id": "ac_66f001_xxxx",
  "code": "FRUIT-2026-0001", // 卡密，唯一
  "status": "UNUSED",       // UNUSED | USED | DISABLED
  "type": "COUPON",          // 权益类型：COUPON | POINTS | MEMBERSHIP | BALANCE
  "benefit": "满100减10优惠券", // 权益描述
  "value": 1000,             // 权益数值（优惠券为分，积分为分/个，视 type 而定）
  "redeemedBy": "oUpF8u_demo_user_openid", // 兑换用户 openid
  "redeemedAt": "2026-09-23T10:00:00.000Z",
  "createdAt": "2026-09-23T09:00:00.000Z",
  "updatedAt": "2026-09-23T10:00:00.000Z"
}
```

### 7. 卡密兑换流水表 (`activation_records`)

```json
{
  "_id": "ar_66f001_xxxx",
  "code": "FRUIT-2026-0001",
  "userId": "oUpF8u_demo_user_openid",
  "type": "COUPON",
  "benefit": "满100减10优惠券",
  "value": 1000,
  "createdAt": "2026-09-23T10:00:00.000Z"
}
```

---

## 三、推荐索引清单 (Database Indexes)

在 CloudBase 控制台为对应集合创建以下复合索引，以保证高并发查询性能：

1. **`orders`**:
   - `idx_order_no`: `{ "orderNo": 1 }` (唯一索引)
   - `idx_user_status`: `{ "userId": 1, "status": 1 }`
   - `idx_created_at`: `{ "createdAt": -1 }`
   - `idx_delivery_type`: `{ "deliveryType": 1 }`
2. **`products`**:
   - `idx_status`: `{ "status": 1 }`
   - `idx_category`: `{ "categoryId": 1, "sort": -1 }`
   - `idx_sales`: `{ "sales": -1 }`
   - `idx_merchant`: `{ "merchantId": 1 }`
2.1 **`categories`**:
   - `idx_parent`: `{ "parentId": 1 }`
   - `idx_sort`: `{ "sort": -1 }`
   - `idx_status`: `{ "status": 1 }`
3. **`product_skus`**:
   - `idx_product_id`: `{ "productId": 1 }`
   - `idx_sku_code`: `{ "skuCode": 1 }` (唯一索引)
4. **`admins`**:
   - `idx_username`: `{ "username": 1 }` (唯一索引)
   - `idx_merchant`: `{ "merchantId": 1 }`
5. **`merchant_orders`**:
   - `idx_merchant`: `{ "merchantId": 1 }`
   - `idx_parent_order`: `{ "parentOrderId": 1 }`
   - `idx_sub_order_no`: `{ "subOrderNo": 1 }` (唯一索引)
   - `idx_user_status`: `{ "userId": 1, "status": 1 }`
6. **`refund_records`**:
   - `idx_out_refund_no`: `{ "outRefundNo": 1 }` (唯一索引)
   - `idx_order_id`: `{ "orderId": 1 }`
   - `idx_merchant`: `{ "merchantId": 1 }`
   - `idx_parent_order`: `{ "parentOrderId": 1 }`
7. **`payment_transactions`**:
   - `idx_out_trade_no`: `{ "outTradeNo": 1 }` (唯一索引)
   - `idx_order_id`: `{ "orderId": 1 }`
8. **`activation_codes`**:
   - `idx_code`: `{ "code": 1 }` (唯一索引)
   - `idx_status`: `{ "status": 1 }`
9. **`activation_records`**:
   - `idx_user`: `{ "userId": 1 }`
   - `idx_code`: `{ "code": 1 }`
