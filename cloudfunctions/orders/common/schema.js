// Single source of truth for collection/index setup. Client access is always private.
module.exports = [
  {name:'store_settings',desc:'商家公开资料与配送计费配置',indexes:[],securityRules:{read:false,write:false}},
  {
    "name": "users",
    "desc": "终端微信用户表",
    "indexes": [
      {
        "name": "idx_openid",
        "key": {
          "_openid": 1
        },
        "unique": true
      },
      {
        "name": "idx_phone",
        "key": {
          "phone": 1
        }
      },
      {
        "name": "idx_created_at",
        "key": {
          "createdAt": -1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "admins",
    "desc": "系统管理员账号表",
    "indexes": [
      {
        "name": "idx_username",
        "key": {
          "username": 1
        },
        "unique": true
      },
      {
        "name": "idx_role",
        "key": {
          "role": 1
        }
      },
      {
        "name": "idx_status",
        "key": {
          "status": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "auth_limits",
    "desc": "管理员登录限流计数（服务端私有）",
    "indexes": [
      {
        "name": "idx_reset_at",
        "key": {
          "resetAt": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "products",
    "desc": "商品核心SPU表",
    "indexes": [
      {
        "name": "idx_status",
        "key": {
          "status": 1
        }
      },
      {
        "name": "idx_category_id",
        "key": {
          "categoryId": 1
        }
      },
      {
        "name": "idx_sort_created",
        "key": {
          "sort": -1,
          "createdAt": -1
        }
      },
      {
        "name": "idx_sales",
        "key": {
          "sales": -1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "product_skus",
    "desc": "商品SKU规格独立表",
    "indexes": [
      {
        "name": "idx_product_id",
        "key": {
          "productId": 1
        }
      },
      {
        "name": "idx_sku_code",
        "key": {
          "skuCode": 1
        },
        "unique": true
      },
      {
        "name": "idx_sku_status",
        "key": {
          "status": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "categories",
    "desc": "商品分类表（一级/二级两级词条）",
    "indexes": [
      {
        "name": "idx_parent",
        "key": {
          "parentId": 1
        }
      },
      {
        "name": "idx_sort",
        "key": {
          "sort": -1
        }
      },
      {
        "name": "idx_status",
        "key": {
          "status": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "carts",
    "desc": "用户购物车表",
    "indexes": [
      {
        "name": "idx_user_id",
        "key": {
          "userId": 1
        }
      },
      {
        "name": "idx_user_sku",
        "key": {
          "userId": 1,
          "skuId": 1
        }
      },
      {
        "name": "user_created",
        "key": {
          "userId": 1,
          "createdAt": -1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "orders",
    "desc": "单商户交易与快递履约订单",
    "indexes": [
      { "name":"buyer_unit_created", "key":{"userId":1,"isPaymentGroup":1,"createdAt":-1} },
      { "name":"unit_status_created", "key":{"isPaymentGroup":1,"status":1,"createdAt":-1} },
      { "name":"payment_expiry_rotation", "key":{"status":1,"isChildOrder":1,"updatedAt":1,"expireAt":1} },
      {
        "name": "idx_order_no",
        "key": {
          "orderNo": 1
        },
        "unique": true
      },
      {
        "name": "idx_user_status",
        "key": {
          "userId": 1,
          "status": 1
        }
      },
      {
        "name": "idx_created_at",
        "key": {
          "createdAt": -1
        }
      },
      {
        "name": "idx_expiry",
        "key": {
          "status": 1,
          "expireAt": 1
        }
      },
      {
        "name": "idx_shipping_retry",
        "key": {
          "wxShippingSync.status": 1,
          "wxShippingSync.nextRetryAt": 1
        }
      },
      {
        "name": "shipping_checked",
        "key": {
          "status": 1,
          "wxCheckedAt": 1
        }
      },
      {
        "name": "buyer_created",
        "key": {
          "userId": 1,
          "createdAt": -1
        }
      },
      {
        "name": "buyer_status_created",
        "key": {
          "userId": 1,
          "status": 1,
          "createdAt": -1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "order_items",
    "desc": "订单商品明细快照表",
    "indexes": [
      {
        "name": "idx_order_id",
        "key": {
          "orderId": 1
        }
      },
      {
        "name": "idx_product_id",
        "key": {
          "productId": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "payment_transactions",
    "desc": "微信支付交易账单流水表",
    "indexes": [
      {
        "name": "idx_out_trade_no",
        "key": {
          "outTradeNo": 1
        },
        "unique": true
      },
      {
        "name": "idx_order_id",
        "key": {
          "orderId": 1
        }
      },
      {
        "name": "idx_user_id",
        "key": {
          "userId": 1
        }
      },
      {
        "name": "idx_created_at",
        "key": {
          "createdAt": -1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "refund_records",
    "desc": "单件订单退款与原交易现金/额度流水",
    "indexes": [
      {
        "name": "idx_out_refund_no",
        "key": {
          "outRefundNo": 1
        },
        "unique": true
      },
      {
        "name": "idx_order_id",
        "key": {
          "orderId": 1
        }
      },
      {
        "name": "idx_created_at",
        "key": {
          "createdAt": -1
        }
      },
      {
        "name": "refund_reconcile",
        "key": {
          "status": 1,
          "isTest": 1,
          "requiresAction": 1,
          "lastCheckedAt": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "activation_codes",
    "desc": "卡密兑换码（激活码）主表",
    "indexes": [
      {
        "name": "idx_code",
        "key": {
          "code": 1
        },
        "unique": true
      },
      {
        "name": "idx_status",
        "key": {
          "status": 1
        }
      },
      {
        "name": "idx_type_status",
        "key": {
          "type": 1,
          "status": 1
        }
      },
      {
        "name": "idx_type_value",
        "key": {
          "type": 1,
          "value": 1
        }
      },
      {
        "name": "idx_type_expire_at",
        "key": {
          "type": 1,
          "expireAt": 1
        }
      },
      {
        "name": "idx_type_created_at",
        "key": {
          "type": 1,
          "createdAt": -1
        }
      },
      {
        "name": "idx_type_status_expire_at",
        "key": {
          "type": 1,
          "status": 1,
          "expireAt": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "activation_records",
    "desc": "卡密兑换流水记录表",
    "indexes": [
      {
        "name": "idx_user",
        "key": {
          "userId": 1
        }
      },
      {
        "name": "idx_code",
        "key": {
          "code": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "addresses",
    "desc": "收货地址簿",
    "indexes": [
      {
        "name": "idx_user_default",
        "key": {
          "userId": 1,
          "isDefault": 1
        }
      },
      {
        "name": "user_updated",
        "key": {
          "userId": 1,
          "updatedAt": -1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "address_meta",
    "desc": "用户默认地址指针（按 OPENID 建立）",
    "indexes": [],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "favorites",
    "desc": "心愿单收藏表",
    "indexes": [
      {
        "name": "idx_user_product",
        "key": {
          "userId": 1,
          "productId": 1
        },
        "unique": true
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "coupons",
    "desc": "优惠券定义表",
    "indexes": [
      {
        "name": "idx_status_valid",
        "key": {
          "status": 1,
          "validTo": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "user_coupons",
    "desc": "用户领券核销表",
    "indexes": [
      {
        "name": "idx_user_coupon",
        "key": {
          "userId": 1,
          "couponId": 1,
          "status": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "banners",
    "desc": "首页轮播广告位",
    "indexes": [
      {
        "name": "idx_sort_status",
        "key": {
          "sort": -1,
          "status": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "operation_logs",
    "desc": "后台管理员操作审计日志表",
    "indexes": [
      {
        "name": "idx_admin_action",
        "key": {
          "adminId": 1,
          "action": 1
        }
      },
      {
        "name": "idx_created_at",
        "key": {
          "createdAt": -1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  },
  {
    "name": "balance_transactions",
    "desc": "购物额度扣减与返还流水",
    "securityRules": {
      "read": false,
      "write": false
    },
    "indexes": [
      {
        "name": "idx_business_key",
        "key": {
          "businessKey": 1
        },
        "unique": true
      },
      {
        "name": "idx_user_created",
        "key": {
          "userId": 1,
          "createdAt": -1
        }
      }
    ]
  },
  {
    "name": "wechat_events",
    "desc": "已验证微信事件接收与幂等处理",
    "securityRules": {
      "read": false,
      "write": false
    },
    "indexes": [
      {
        "name": "idx_state_created",
        "key": {
          "status": 1,
          "createdAt": 1
        }
      }
    ]
  },
  {
    "name": "ad_configs",
    "desc": "广告配置（首发禁用）",
    "securityRules": {
      "read": false,
      "write": false
    },
    "indexes": []
  },
  {
    "name": "ad_reward_records",
    "desc": "广告奖励审计",
    "securityRules": {
      "read": false,
      "write": false
    },
    "indexes": []
  },
  {
    "name": "content_reviews",
    "desc": "微信异步图片审核任务",
    "indexes": [
      {
        "name": "traceId",
        "key": {
          "traceId": 1
        }
      },
      {
        "name": "entity_version",
        "key": {
          "entityType": 1,
          "entityId": 1,
          "version": 1
        }
      },
      {
        "name": "queue",
        "key": {
          "status": 1,
          "updatedAt": 1
        }
      }
    ],
    "securityRules": {
      "read": false,
      "write": false
    }
  }
];
