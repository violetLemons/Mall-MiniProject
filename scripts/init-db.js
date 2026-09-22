/**
 * CloudBase 数据库集合与索引初始化配置脚本 (Database Schema & Indexes)
 * 输出 CloudBase 数据库集合、索引与权限清单。
 * 微信开发者工具 CLI 不提供数据库 DDL 接口，因此本脚本不会伪装执行云端写入。
 * 默认打印清单；可用 --json <path> 导出供控制台或部署脚本使用。
 */

const fs = require('fs');
const path = require('path');

const COLLECTIONS_CONFIG = [
  {
    name: 'users',
    desc: '终端微信用户表',
    indexes: [
      { name: 'idx_openid', key: { _openid: 1 }, unique: true },
      { name: 'idx_phone', key: { phone: 1 } },
      { name: 'idx_created_at', key: { createdAt: -1 } }
    ]
  },
  {
    name: 'admins',
    desc: '系统管理员账号表',
    indexes: [
      { name: 'idx_username', key: { username: 1 }, unique: true },
      { name: 'idx_role', key: { role: 1 } },
      { name: 'idx_status', key: { status: 1 } },
      { name: 'idx_merchant', key: { merchantId: 1 } }
    ]
  },
  {
    name: 'auth_limits',
    desc: '管理员登录限流计数（服务端私有）',
    indexes: [
      { name: 'idx_reset_at', key: { resetAt: 1 } }
    ]
  },
  {
    name: 'products',
    desc: '商品核心SPU表',
    indexes: [
      { name: 'idx_status', key: { status: 1 } },
      { name: 'idx_category_id', key: { categoryId: 1 } },
      { name: 'idx_sort_created', key: { sort: -1, createdAt: -1 } },
      { name: 'idx_sales', key: { sales: -1 } },
      { name: 'idx_merchant', key: { merchantId: 1 } }
    ]
  },
  {
    name: 'product_skus',
    desc: '商品SKU规格独立表',
    indexes: [
      { name: 'idx_product_id', key: { productId: 1 } },
      { name: 'idx_sku_code', key: { skuCode: 1 }, unique: true },
      { name: 'idx_sku_status', key: { status: 1 } }
    ]
  },
  {
    name: 'categories',
    desc: '商品分类表（一级/二级两级词条）',
    indexes: [
      { name: 'idx_parent', key: { parentId: 1 } },
      { name: 'idx_sort', key: { sort: -1 } },
      { name: 'idx_status', key: { status: 1 } }
    ]
  },
  {
    name: 'carts',
    desc: '用户购物车表',
    indexes: [
      { name: 'idx_user_id', key: { userId: 1 } },
      { name: 'idx_user_sku', key: { userId: 1, skuId: 1 } }
    ]
  },
  {
    name: 'orders',
    desc: '交易订单主表',
    indexes: [
      { name: 'idx_order_no', key: { orderNo: 1 }, unique: true },
      { name: 'idx_user_status', key: { userId: 1, status: 1 } },
      { name: 'idx_created_at', key: { createdAt: -1 } },
      { name: 'idx_delivery_type', key: { deliveryType: 1 } }
    ]
  },
  {
    name: 'order_items',
    desc: '订单商品明细快照表',
    indexes: [
      { name: 'idx_order_id', key: { orderId: 1 } },
      { name: 'idx_product_id', key: { productId: 1 } }
    ]
  },
  {
    name: 'merchant_orders',
    desc: '商家子订单表（按商品拆分，合并支付下各商家/各商品独立履约）',
    indexes: [
      { name: 'idx_merchant', key: { merchantId: 1 } },
      { name: 'idx_parent_order', key: { parentOrderId: 1 } },
      { name: 'idx_sub_order_no', key: { subOrderNo: 1 }, unique: true },
      { name: 'idx_user_status', key: { userId: 1, status: 1 } },
      { name: 'idx_created_at', key: { createdAt: -1 } }
    ]
  },
  {
    name: 'payment_transactions',
    desc: '微信支付交易账单流水表',
    indexes: [
      { name: 'idx_out_trade_no', key: { outTradeNo: 1 }, unique: true },
      { name: 'idx_order_id', key: { orderId: 1 } },
      { name: 'idx_user_id', key: { userId: 1 } },
      { name: 'idx_created_at', key: { createdAt: -1 } }
    ]
  },
  {
    name: 'refund_records',
    desc: '退款申请与流水记录表（按子订单整单退）',
    indexes: [
      { name: 'idx_out_refund_no', key: { outRefundNo: 1 }, unique: true },
      { name: 'idx_order_id', key: { orderId: 1 } },
      { name: 'idx_merchant', key: { merchantId: 1 } },
      { name: 'idx_parent_order', key: { parentOrderId: 1 } },
      { name: 'idx_created_at', key: { createdAt: -1 } }
    ]
  },
  {
    name: 'activation_codes',
    desc: '卡密兑换码（激活码）主表',
    indexes: [
      { name: 'idx_code', key: { code: 1 }, unique: true },
      { name: 'idx_status', key: { status: 1 } }
    ]
  },
  {
    name: 'activation_records',
    desc: '卡密兑换流水记录表',
    indexes: [
      { name: 'idx_user', key: { userId: 1 } },
      { name: 'idx_code', key: { code: 1 } }
    ]
  },
  {
    name: 'addresses',
    desc: '收货地址簿',
    indexes: [
      { name: 'idx_user_default', key: { userId: 1, isDefault: 1 } }
    ]
  },
  {
    name: 'address_meta',
    desc: '用户默认地址指针（按 OPENID 建立）',
    indexes: []
  },
  {
    name: 'favorites',
    desc: '心愿单收藏表',
    indexes: [
      { name: 'idx_user_product', key: { userId: 1, productId: 1 }, unique: true }
    ]
  },
  {
    name: 'coupons',
    desc: '优惠券定义表',
    indexes: [
      { name: 'idx_status_valid', key: { status: 1, validTo: 1 } }
    ]
  },
  {
    name: 'user_coupons',
    desc: '用户领券核销表',
    indexes: [
      { name: 'idx_user_coupon', key: { userId: 1, couponId: 1, status: 1 } }
    ]
  },
  {
    name: 'banners',
    desc: '首页轮播广告位',
    indexes: [
      { name: 'idx_sort_status', key: { sort: -1, status: 1 } }
    ]
  },
  {
    name: 'operation_logs',
    desc: '后台管理员操作审计日志表',
    indexes: [
      { name: 'idx_admin_action', key: { adminId: 1, action: 1 } },
      { name: 'idx_created_at', key: { createdAt: -1 } }
    ]
  },
  {
    name: 'inventory_logs',
    desc: '库存出入库变动流水记录表',
    indexes: [
      { name: 'idx_product_sku', key: { productId: 1, skuId: 1 } },
      { name: 'idx_created_at', key: { createdAt: -1 } }
    ]
  },
  {
    name: 'pickup_points',
    desc: '校园潮流自提网点表',
    indexes: [
      { name: 'idx_status', key: { status: 1 } }
    ]
  }
];

function run() {
  const isApply = process.argv.includes('--apply');
  const jsonIndex = process.argv.indexOf('--json');
  const jsonPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : '';
  console.log('================================================================');
  console.log('           通用商城 CloudBase 数据库集合与索引规划            ');
  console.log('================================================================');
  console.log(`执行模式: ${isApply ? '【拒绝伪执行 APPLY】' : '【安全清单 DRY-RUN】'}`);
  console.log(`集合总数: ${COLLECTIONS_CONFIG.length} 个集合\n`);

  COLLECTIONS_CONFIG.forEach((col, idx) => {
    console.log(`[${idx + 1}/${COLLECTIONS_CONFIG.length}] 集合: ${col.name.padEnd(22)} 描述: ${col.desc}`);
    col.indexes.forEach(idxDef => {
      const keys = Object.entries(idxDef.key).map(([k, v]) => `${k}:${v}`).join(', ');
      console.log(`      ↳ 索引: ${idxDef.name.padEnd(20)} 字段: { ${keys} } ${idxDef.unique ? '(UNIQUE)' : ''}`);
    });
  });

  if (jsonPath) {
    const target = path.resolve(jsonPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify({ collections: COLLECTIONS_CONFIG }, null, 2)}\n`, 'utf8');
    console.log(`已导出数据库清单: ${target}`);
  }
  console.log('================================================================');
  if (isApply) {
    console.error('错误: 微信开发者工具 CLI 当前没有 CloudBase 数据库建表/索引 API，本脚本未执行任何云端写入。');
    console.error('请在 CloudBase 控制台按清单创建集合、索引和权限，并在完成后读取结果留档。');
    process.exitCode = 2;
  } else {
    console.log('提示: 当前仅输出清单，未对云端数据库做任何修改。');
    console.log('可使用 node scripts/init-db.js --json work/cloud-seed/database-manifest.json 导出结构清单。');
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  COLLECTIONS_CONFIG
};
