/**
 * 微信小程序订单发货管理服务 (wxOrderShippingService)
 * 遵循微信官方《小程序发货信息管理服务》及 OpenAPI / REST 规范
 * 
 * 核心功能：
 * 1. syncExpressShipping: 商城后台发货 -> 微信 (logistics_type: 1 实体快递配送，写入 wxShippingSync.status = 'synced')
 * 2. syncPickupCompletion: 商城后台自提完成 -> 微信 (logistics_type: 4 用户自提，严禁虚假单号)
 * 3. queryWxShippingStatus: 查询微信平台发货状态 (/wxa/sec/order/get_order)
 * 4. reconcileOrderWithWechat: 微信 -> 商城后台 单单反向对账与状态同步
 * 5. reconcileBatchOrders: 批量增量反向对账
 * 6. resolveShippingConflict: 物流冲突人工仲裁 (以微信为准 / 以本地为准)
 * 7. retryWxShippingSync: 失败发货重新同步微信
 */

const https = require('https');

const DEFAULT_MCH_ID = 'YOUR_WECHAT_PAY_MCH_ID';
const DEFAULT_APP_ID = 'wxYOUR_MINIPROGRAM_APPID';

// 微信官方物流公司编码映射表
const EXPRESS_COMPANY_CODES = {
  '顺丰速运': 'SF',
  '顺丰': 'SF',
  'SF': 'SF',
  '极速快递': 'SF',
  '极速快递包邮': 'SF',
  '中通快递': 'ZTO',
  '中通': 'ZTO',
  'ZTO': 'ZTO',
  '圆通速递': 'YTO',
  '圆通': 'YTO',
  'YTO': 'YTO',
  '韵达速递': 'YD',
  '韵达': 'YD',
  'YD': 'YD',
  '极兔速递': 'JTSD',
  '极兔': 'JTSD',
  'JTSD': 'JTSD',
  'JT': 'JTSD',
  '邮政EMS': 'EMS',
  'EMS': 'EMS',
  '邮政速递': 'EMS',
  '京东快递': 'JD',
  '京东物流': 'JD',
  'JD': 'JD',
  '德邦快递': 'DBL',
  '德邦': 'DBL',
  'DBL': 'DBL',
  '申通快递': 'STO',
  '申通': 'STO',
  'STO': 'STO'
};

const COMPANY_CODE_TO_NAME = {
  'SF': '极速快递',
  'ZTO': '中通快递',
  'YTO': '圆通速递',
  'YD': '韵达速递',
  'JTSD': '极兔速递',
  'EMS': '邮政EMS',
  'JD': '京东快递',
  'DBL': '德邦快递',
  'STO': '申通快递'
};

function getExpressCompanyCode(nameOrCode) {
  const clean = String(nameOrCode || '').trim().toUpperCase();
  if (EXPRESS_COMPANY_CODES[clean]) return EXPRESS_COMPANY_CODES[clean];
  const byName = EXPRESS_COMPANY_CODES[String(nameOrCode || '').trim()];
  if (byName) return byName;
  return clean || 'SF';
}

function getExpressCompanyName(code) {
  const clean = String(code || '').trim().toUpperCase();
  return COMPANY_CODE_TO_NAME[clean] || code || '极速快递';
}

function getItemDesc(order) {
  if (!order.items || !order.items.length) return '实物商品订单';
  const first = order.items[0];
  const name = first.productName || first.name || '通用商品';
  const spec = first.size ? ` (规格${first.size})` : '';
  const extra = order.items.length > 1 ? ` 等共${order.items.length}件商品` : '';
  return `${name}${spec}${extra}`.slice(0, 120);
}

// 内存缓存 access_token (TTL 7000s)
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken(appId, appSecret) {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }
  if (!appSecret) return null;

  return new Promise((resolve) => {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            cachedToken = json.access_token;
            tokenExpiresAt = Date.now() + ((json.expires_in || 7200) * 1000);
            resolve(cachedToken);
          } else {
            console.warn('[wxOrderShippingService] 获取 access_token 失败:', json.errmsg || json);
            resolve(null);
          }
        } catch (_) {
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.warn('[wxOrderShippingService] 请求 access_token 网络异常:', err.message);
      resolve(null);
    });
  });
}

function requestHttpsJson(url, postData) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(postData);
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ errcode: -1, errmsg: data });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/**
 * 底层发货信息上报调度器 (优先云开发 OpenAPI，容灾降级为服务端 HTTPS REST)
 */
async function callUploadShippingInfo(cloud, payload) {
  // 1. 优先尝试微信云开发官方 openapi
  if (cloud && cloud.openapi && cloud.openapi.wxa.sec.order && typeof cloud.openapi.wxa.sec.order.uploadShippingInfo === 'function') {
    try {
      console.log('[wxOrderShippingService] 尝试使用 cloud.openapi.wxa.sec.order.uploadShippingInfo');
      const res = await cloud.openapi.wxa.sec.order.uploadShippingInfo(payload);
      if (res && (res.errcode === 0 || res.errCode === 0)) {
        return { success: true, errcode: 0, errmsg: 'ok', via: 'cloud.openapi' };
      }
      return { success: false, errcode: res.errcode || res.errCode || -1, errmsg: res.errmsg || res.errMsg || 'OpenAPI返回异常', via: 'cloud.openapi' };
    } catch (openErr) {
      console.warn('[wxOrderShippingService] cloud.openapi 调用失败，准备降级尝试:', openErr.message || openErr);
      if (openErr.errCode || openErr.errcode) {
        return { success: false, errcode: openErr.errCode || openErr.errcode, errmsg: openErr.errMsg || openErr.message, via: 'cloud.openapi' };
      }
    }
  }

  // 2. 尝试云调用底层通用 callOpenAPI
  if (cloud && typeof cloud.callOpenAPI === 'function') {
    try {
      console.log('[wxOrderShippingService] 尝试使用 cloud.callOpenAPI');
      const res = await cloud.callOpenAPI({
        api: 'wxa.sec.order.uploadShippingInfo',
        data: payload
      });
      const data = res.result || res;
      if (data && (data.errcode === 0 || data.errCode === 0)) {
        return { success: true, errcode: 0, errmsg: 'ok', via: 'callOpenAPI' };
      }
      if (data && (data.errcode || data.errCode)) {
        return { success: false, errcode: data.errcode || data.errCode, errmsg: data.errmsg || data.errMsg, via: 'callOpenAPI' };
      }
    } catch (callErr) {
      console.warn('[wxOrderShippingService] cloud.callOpenAPI 失败:', callErr.message || callErr);
    }
  }

  // 3. 服务端 HTTPS REST API 降级调用
  const appId = process.env.WECHAT_APP_ID || DEFAULT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (appSecret) {
    const token = await getAccessToken(appId, appSecret);
    if (token) {
      console.log('[wxOrderShippingService] 尝试使用 HTTPS REST API 上报发货');
      const url = `https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info?access_token=${encodeURIComponent(token)}`;
      const restRes = await requestHttpsJson(url, payload);
      if (restRes && (restRes.errcode === 0 || restRes.errCode === 0)) {
        return { success: true, errcode: 0, errmsg: 'ok', via: 'https.rest' };
      }
      return { success: false, errcode: restRes.errcode || restRes.errCode || -1, errmsg: restRes.errmsg || restRes.errMsg || '微信接口调用失败', via: 'https.rest' };
    }
  }

  return {
    success: false,
    errcode: -504001,
    errmsg: '微信云开发发货管理接口未开通或未配置服务端密钥(WECHAT_APP_SECRET)，请在微信公众平台开通【发货信息管理服务】',
    via: 'none'
  };
}

/**
 * 查询微信官方发货状态底层调度器 (/wxa/sec/order/get_order)
 */
async function callGetOrder(cloud, orderNo) {
  const mchId = process.env.WECHAT_PAY_MCH_ID || DEFAULT_MCH_ID;
  const payload = {
    order_key: {
      order_number_type: 1, // 1: 商户订单号 (orderNo)
      mchid: mchId,
      out_trade_no: orderNo
    }
  };

  // 1. 尝试云调用 openapi.wxa.sec.order.getOrder
  if (cloud && cloud.openapi && cloud.openapi.wxa.sec.order && typeof cloud.openapi.wxa.sec.order.getOrder === 'function') {
    try {
      const res = await cloud.openapi.wxa.sec.order.getOrder(payload);
      if (res && (res.errcode === 0 || res.errCode === 0) && res.order) {
        return { success: true, errcode: 0, errmsg: 'ok', order: res.order, via: 'cloud.openapi' };
      }
      if (res && (res.errcode || res.errCode)) {
        return { success: false, errcode: res.errcode || res.errCode, errmsg: res.errmsg || res.errMsg, via: 'cloud.openapi' };
      }
    } catch (openErr) {
      if (openErr.errCode || openErr.errcode) {
        return { success: false, errcode: openErr.errCode || openErr.errcode, errmsg: openErr.errMsg || openErr.message, via: 'cloud.openapi' };
      }
    }
  }

  // 2. 尝试通用 callOpenAPI
  if (cloud && typeof cloud.callOpenAPI === 'function') {
    try {
      const res = await cloud.callOpenAPI({
        api: 'wxa.sec.order.getOrder',
        data: payload
      });
      const data = res.result || res;
      if (data && (data.errcode === 0 || data.errCode === 0) && data.order) {
        return { success: true, errcode: 0, errmsg: 'ok', order: data.order, via: 'callOpenAPI' };
      }
      if (data && (data.errcode || data.errCode)) {
        return { success: false, errcode: data.errcode || data.errCode, errmsg: data.errmsg || data.errMsg, via: 'callOpenAPI' };
      }
    } catch (_) {}
  }

  // 3. 服务端 HTTPS REST API
  const appId = process.env.WECHAT_APP_ID || DEFAULT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (appSecret) {
    const token = await getAccessToken(appId, appSecret);
    if (token) {
      const url = `https://api.weixin.qq.com/wxa/sec/order/get_order?access_token=${encodeURIComponent(token)}`;
      const restRes = await requestHttpsJson(url, payload);
      if (restRes && (restRes.errcode === 0 || restRes.errCode === 0) && restRes.order) {
        return { success: true, errcode: 0, errmsg: 'ok', order: restRes.order, via: 'https.rest' };
      }
      return { success: false, errcode: restRes.errcode || restRes.errCode || -1, errmsg: restRes.errmsg || restRes.errMsg || '微信接口查询失败', via: 'https.rest' };
    }
  }

  return {
    success: false,
    errcode: -504002,
    errmsg: '未开通微信发货管理或未配置服务端安全密钥(WECHAT_APP_SECRET)',
    via: 'none'
  };
}

const wxOrderShippingService = {
  /**
   * 1. 商城后台 -> 微信：快递订单发货履约同步
   */
  async syncExpressShipping(cloud, db, order, shippingParams = {}) {
    if (order.isTest) {
      return { status: 'synced', message: '测试订单已完成本地发货模拟', isTest: true };
    }

    const mchId = process.env.WECHAT_PAY_MCH_ID || DEFAULT_MCH_ID;
    const itemDesc = getItemDesc(order);
    const payerOpenid = order.payerOpenid || order.userId || order.userOpenid || '';

    // 是否全部发货完成 (多子订单分批发货时，未全部发完前为 false)
    const isAllDelivered = shippingParams.isAllDelivered !== false;

    // 支持多包裹：优先使用传入的 shipments 数组，否则回退到单包裹
    const rawShipments = Array.isArray(shippingParams.shipments) && shippingParams.shipments.length
      ? shippingParams.shipments
      : [{ trackingNo: shippingParams.trackingNo || order.trackingNo, logisticsCompany: shippingParams.logisticsCompany || order.logisticsCompany, expressCompany: shippingParams.expressCompany }];

    const phoneStr = String(order.shippingAddress?.phone || '').replace(/\D/g, '');
    const last4 = phoneStr.length >= 4 ? phoneStr.slice(-4) : (phoneStr || '0000');

    // 顺丰/极速快递必须包含联系方式 (收件人手机后4位)
    const buildShippingListItem = (shipment) => {
      const sTrackingNo = String(shipment.trackingNo || '').trim();
      const companyRaw = shipment.logisticsCompany || shipment.expressCompany || '极速快递';
      const companyCode = getExpressCompanyCode(shipment.logisticsCompanyCode || shipment.expressCompany || companyRaw);
      let contact;
      if (companyCode === 'SF') {
        contact = { receiver_contact: last4 };
      }
      return {
        tracking_no: sTrackingNo,
        express_company: companyCode,
        item_desc: itemDesc,
        ...(contact ? { contact } : {})
      };
    };
    const shippingListItems = rawShipments.map(buildShippingListItem);

    // 构造符合微信官方当前规范的标准请求包
    const payload = {
      order_key: {
        order_number_type: 1, // 1: 商户订单号 (orderNo)
        mchid: mchId,
        out_trade_no: order.orderNo
      },
      delivery_mode: rawShipments.length > 1 ? 2 : 1, // 1: 统一发货 2: 分拆发货(多包裹)
      logistics_type: 1, // 1: 实体物流配送采用快递公司
      is_all_delivered: isAllDelivered,
      shipping_list: shippingListItems,
      upload_time: new Date().toISOString(),
      payer: {
        openid: payerOpenid
      }
    };

    const callRes = await callUploadShippingInfo(cloud, payload);
    const syncTime = new Date();
    const isSuccess = callRes.success === true;

    // 状态对齐：synced / failed
    const wxShippingSync = {
      status: isSuccess ? 'synced' : 'failed',
      source: 'mall',
      type: 'EXPRESS',
      syncedAt: syncTime,
      lastErrorCode: isSuccess ? null : String(callRes.errcode),
      lastErrorMessage: isSuccess ? null : String(callRes.errmsg).slice(0, 200),
      retryCount: ((order.wxShippingSync && order.wxShippingSync.retryCount) || 0) + 1
    };

    try {
      await db.collection('orders').doc(order._id || order.id).update({
        data: {
          wxShippingSync,
          shippingSyncStatus: isSuccess ? 'SHIPPING_SYNC_SUCCESS' : 'SHIPPING_SYNC_FAILED',
          shippingSyncError: isSuccess ? null : callRes.errmsg,
          shippingSyncAt: syncTime,
          updatedAt: syncTime
        }
      });
    } catch (dbUpdateErr) {
      console.warn('[wxOrderShippingService] 更新 orders 表 wxShippingSync 失败:', dbUpdateErr.message);
    }

    return {
      status: isSuccess ? 'synced' : 'failed',
      message: isSuccess ? '微信订单发货信息上报成功' : `微信发货上报失败: [${callRes.errcode}] ${callRes.errmsg}`,
      errcode: callRes.errcode,
      errmsg: callRes.errmsg
    };
  },

  /**
   * 2. 商城后台 -> 微信：到店自提完成交付履约同步 (logistics_type: 4 用户自提，严禁虚假单号)
   */
  async syncPickupCompletion(cloud, db, order) {
    if (order.isTest) {
      return { status: 'synced', message: '测试自提订单已完成交付', isTest: true };
    }

    const mchId = process.env.WECHAT_PAY_MCH_ID || DEFAULT_MCH_ID;
    const itemDesc = getItemDesc(order);
    const payerOpenid = order.payerOpenid || order.userId || order.userOpenid || '';

    // 自提模式严格禁止生成 tracking_no 与 express_company
    const payload = {
      order_key: {
        order_number_type: 1,
        mchid: mchId,
        out_trade_no: order.orderNo
      },
      delivery_mode: 1,
      logistics_type: 4, // 4: 用户自提
      is_all_delivered: true,
      shipping_list: [
        {
          item_desc: itemDesc
        }
      ],
      upload_time: new Date().toISOString(),
      payer: {
        openid: payerOpenid
      }
    };

    const callRes = await callUploadShippingInfo(cloud, payload);
    const syncTime = new Date();
    const isSuccess = callRes.success === true;

    const wxShippingSync = {
      status: isSuccess ? 'synced' : 'failed',
      source: 'mall',
      type: 'PICKUP',
      syncedAt: syncTime,
      lastErrorCode: isSuccess ? null : String(callRes.errcode),
      lastErrorMessage: isSuccess ? null : String(callRes.errmsg).slice(0, 200),
      retryCount: ((order.wxShippingSync && order.wxShippingSync.retryCount) || 0) + 1
    };

    try {
      await db.collection('orders').doc(order._id || order.id).update({
        data: {
          wxShippingSync,
          shippingSyncStatus: isSuccess ? 'SHIPPING_SYNC_SUCCESS' : 'SHIPPING_SYNC_FAILED',
          shippingSyncError: isSuccess ? null : callRes.errmsg,
          shippingSyncAt: syncTime,
          updatedAt: syncTime
        }
      });
    } catch (dbUpdateErr) {
      console.warn('[wxOrderShippingService] 更新 orders 表自提履约失败:', dbUpdateErr.message);
    }

    return {
      status: isSuccess ? 'synced' : 'failed',
      message: isSuccess ? '微信自提履约信息同步成功' : `微信自提同步失败: [${callRes.errcode}] ${callRes.errmsg}`,
      errcode: callRes.errcode,
      errmsg: callRes.errmsg
    };
  },

  /**
   * 3. 查询微信平台发货状态 (/wxa/sec/order/get_order)
   */
  async queryWxShippingStatus(cloud, order) {
    return callGetOrder(cloud, order.orderNo);
  },

  /**
   * 4. 微信 -> 商城后台：单单反向对账与状态同步 (带冲突检测与自提兼容)
   */
  async reconcileOrderWithWechat(cloud, db, order) {
    if (!order || !order.orderNo) {
      return { success: false, action: 'INVALID_ORDER', message: '无效订单' };
    }
    if (order.isTest) {
      return { success: true, action: 'SKIPPED_TEST_ORDER', message: '测试订单已跳过微信对账' };
    }

    const getRes = await callGetOrder(cloud, order.orderNo);
    if (!getRes.success || !getRes.order) {
      return {
        success: false,
        action: 'WECHAT_QUERY_FAILED',
        errcode: getRes.errcode,
        message: getRes.errmsg || '查询微信发货状态失败'
      };
    }

    const wxOrder = getRes.order;
    // 微信 order_state: 1 待发货 (UNSHIPPED), 2 已发货 (SHIPPED), 3 确认收货 (RECEIVED), 4 交易完成 (FINISHED)
    const orderState = Number(wxOrder.order_state !== undefined ? wxOrder.order_state : wxOrder.orderState);
    const shipping = wxOrder.shipping || {};
    const shippingList = shipping.shipping_list || shipping.shippingList || [];
    const logisticsType = Number(shipping.logistics_type !== undefined ? shipping.logistics_type : shipping.logisticsType);
    const firstShip = shippingList[0] || {};
    const wxTrackingNo = String(firstShip.tracking_no || firstShip.trackingNo || '').trim();
    const wxExpressCompany = String(firstShip.express_company || firstShip.expressCompany || '').trim();
    const wxUploadTime = firstShip.upload_time || firstShip.uploadTime || wxOrder.pay_time || null;
    const wxUploadDate = wxUploadTime ? new Date(typeof wxUploadTime === 'number' && wxUploadTime < 10000000000 ? wxUploadTime * 1000 : wxUploadTime) : new Date();

    const isPickup = order.deliveryType === 'PICKUP' || order.deliveryType === 'pickup' || logisticsType === 4;
    const isLocalPaid = ['PAID', 'WAITING_PICKUP', 'READY_FOR_PICKUP'].includes(order.status);
    const isLocalShipped = order.status === 'SHIPPED';
    const isLocalCompleted = order.status === 'COMPLETED';
    const isWxShipped = orderState >= 2;

    const docId = order._id || order.id;

    // -------------------------------------------------------------
    // 规则 1: 微信 = 已发货 (orderState >= 2), 本地 = 待发货 (PAID)
    // -> 以微信已发货事实为准更新本地
    // -------------------------------------------------------------
    if (isWxShipped && isLocalPaid) {
      if (isPickup) {
        // 自提订单：微信已履约 -> 本地标记完成
        await db.collection('orders').doc(docId).update({
          data: {
            status: 'COMPLETED',
            orderStatus: 'COMPLETED',
            completedAt: wxUploadDate,
            completeTime: wxUploadDate,
            'pickupInfo.pickupStatus': 'PICKED',
            wxShippingSync: {
              status: 'synced',
              source: 'wechat',
              type: 'PICKUP',
              syncedAt: new Date(),
              lastErrorCode: null,
              lastErrorMessage: null
            },
            shippingSyncStatus: 'SHIPPING_SYNC_SUCCESS',
            updatedAt: new Date()
          }
        });
        return {
          success: true,
          action: 'LOCAL_UPDATED_FROM_WECHAT',
          status: 'synced',
          message: `微信已履约，本地自提订单 [${order.orderNo}] 已同步更新为已完成`
        };
      } else {
        // 快递订单：微信已发货 -> 本地更新为已发货并写入微信物流
        const compName = getExpressCompanyName(wxExpressCompany);
        await db.collection('orders').doc(docId).update({
          data: {
            status: 'SHIPPED',
            orderStatus: 'SHIPPED',
            shippingStatus: 'SHIPPED',
            trackingNo: wxTrackingNo || order.trackingNo || '',
            logisticsCompany: compName || order.logisticsCompany || '极速快递',
            expressCompany: wxExpressCompany || 'SF',
            shippedAt: wxUploadDate,
            shippingTime: wxUploadDate,
            wxShippingSync: {
              status: 'synced',
              source: 'wechat',
              type: 'EXPRESS',
              syncedAt: new Date(),
              lastErrorCode: null,
              lastErrorMessage: null
            },
            shippingSyncStatus: 'SHIPPING_SYNC_SUCCESS',
            updatedAt: new Date()
          }
        });
        return {
          success: true,
          action: 'LOCAL_UPDATED_FROM_WECHAT',
          status: 'synced',
          message: `微信已发货，本地订单 [${order.orderNo}] 已同步为已发货 (单号: ${wxTrackingNo || '未回传'})`
        };
      }
    }

    // -------------------------------------------------------------
    // 规则 2: 本地 = 已发货/已完成, 微信 = 未发货 (orderState === 1)
    // -> 尝试把本地物流信息重新同步至微信
    // -------------------------------------------------------------
    if (!isWxShipped && (isLocalShipped || (isLocalCompleted && isPickup))) {
      let syncRes;
      if (isPickup) {
        syncRes = await this.syncPickupCompletion(cloud, db, order);
      } else {
        syncRes = await this.syncExpressShipping(cloud, db, order, {
          trackingNo: order.trackingNo,
          logisticsCompany: order.logisticsCompany,
          logisticsCompanyCode: order.expressCompany
        });
      }
      return {
        success: syncRes.status === 'synced',
        action: syncRes.status === 'synced' ? 'WECHAT_SYNCED_FROM_LOCAL' : 'WECHAT_SYNC_FAILED',
        status: syncRes.status,
        message: syncRes.status === 'synced' ? `本地已发货，微信已补同步成功` : `本地已发货，微信补同步失败: ${syncRes.errmsg}`
      };
    }

    // -------------------------------------------------------------
    // 规则 3: 两边都已发货，但物流信息不同
    // -> 不静默覆盖，标记 conflict，由管理员人工确认
    // -------------------------------------------------------------
    if (isWxShipped && isLocalShipped && !isPickup) {
      const localTrack = String(order.trackingNo || '').trim().toUpperCase();
      const remoteTrack = String(wxTrackingNo || '').trim().toUpperCase();
      const localCompCode = getExpressCompanyCode(order.logisticsCompany || order.expressCompany);
      const remoteCompCode = getExpressCompanyCode(wxExpressCompany);

      const hasTrackConflict = localTrack && remoteTrack && localTrack !== remoteTrack;
      const hasCompanyConflict = localCompCode && remoteCompCode && localCompCode !== remoteCompCode;

      if (hasTrackConflict || hasCompanyConflict) {
        const conflictDetail = {
          local: {
            trackingNo: order.trackingNo || '',
            logisticsCompany: order.logisticsCompany || '极速快递',
            shippedAt: order.shippedAt || order.shippingTime
          },
          wechat: {
            trackingNo: wxTrackingNo || '',
            expressCompany: wxExpressCompany || '',
            logisticsCompany: getExpressCompanyName(wxExpressCompany),
            uploadTime: wxUploadDate
          }
        };

        await db.collection('orders').doc(docId).update({
          data: {
            wxShippingSync: {
              status: 'conflict',
              source: 'both',
              message: '微信与本地物流信息不一致',
              conflictDetail,
              syncedAt: new Date(),
              retryCount: ((order.wxShippingSync && order.wxShippingSync.retryCount) || 0) + 1
            },
            shippingSyncStatus: 'SHIPPING_SYNC_CONFLICT',
            updatedAt: new Date()
          }
        });

        return {
          success: false,
          action: 'LOGISTICS_CONFLICT',
          status: 'conflict',
          message: `订单 [${order.orderNo}] 微信与本地物流单号不一致，需人工核对`,
          conflictDetail
        };
      } else {
        // 两侧数据一致
        if (!order.wxShippingSync || order.wxShippingSync.status !== 'synced') {
          await db.collection('orders').doc(docId).update({
            data: {
              wxShippingSync: {
                status: 'synced',
                source: order.wxShippingSync?.source || 'both',
                type: 'EXPRESS',
                syncedAt: new Date()
              },
              shippingSyncStatus: 'SHIPPING_SYNC_SUCCESS',
              updatedAt: new Date()
            }
          });
        }
        return { success: true, action: 'ALREADY_SYNCED', status: 'synced', message: '两侧发货信息一致' };
      }
    }

    // -------------------------------------------------------------
    // 规则 4: 两边都是待发货 (orderState === 1 && isLocalPaid)
    // -------------------------------------------------------------
    if (!isWxShipped && isLocalPaid) {
      return { success: true, action: 'BOTH_PENDING', status: 'pending', message: '两侧均为待发货/待履约状态' };
    }

    return { success: true, action: 'NO_ACTION_NEEDED', status: order.wxShippingSync?.status || 'synced' };
  },

  /**
   * 5. 批量对账近期订单 (安全限制最大批次)
   */
  async reconcileBatchOrders(cloud, db, orders = []) {
    const list = Array.isArray(orders) ? orders : [];
    const results = [];
    for (const ord of list.slice(0, 15)) {
      try {
        const res = await this.reconcileOrderWithWechat(cloud, db, ord);
        results.push({ orderNo: ord.orderNo, ...res });
      } catch (err) {
        results.push({ orderNo: ord.orderNo, success: false, error: err.message });
      }
    }
    return results;
  },

  /**
   * 6. 人工冲突裁决 (以微信为准 / 以本地为准)
   */
  async resolveShippingConflict(cloud, db, order, resolution = 'USE_WECHAT') {
    const docId = order._id || order.id;
    const conflict = order.wxShippingSync?.conflictDetail;
    if (!conflict) {
      return { success: false, message: '该订单不存在冲突信息' };
    }

    if (resolution === 'USE_WECHAT') {
      // 以微信为准：覆写本地单号与快递公司
      const wxInfo = conflict.wechat;
      await db.collection('orders').doc(docId).update({
        data: {
          trackingNo: wxInfo.trackingNo,
          logisticsCompany: wxInfo.logisticsCompany,
          expressCompany: wxInfo.expressCompany,
          shippedAt: wxInfo.uploadTime ? new Date(wxInfo.uploadTime) : new Date(),
          wxShippingSync: {
            status: 'synced',
            source: 'wechat',
            type: 'EXPRESS',
            syncedAt: new Date(),
            resolvedFromConflict: 'USE_WECHAT'
          },
          shippingSyncStatus: 'SHIPPING_SYNC_SUCCESS',
          updatedAt: new Date()
        }
      });
      return { success: true, message: '已按微信侧物流信息更新本地订单' };
    } else if (resolution === 'USE_LOCAL') {
      // 以本地为准：强制重新上传本地物流信息至微信
      const syncRes = await this.syncExpressShipping(cloud, db, order, {
        trackingNo: order.trackingNo,
        logisticsCompany: order.logisticsCompany,
        logisticsCompanyCode: order.expressCompany
      });
      if (syncRes.status === 'synced') {
        await db.collection('orders').doc(docId).update({
          data: {
            'wxShippingSync.resolvedFromConflict': 'USE_LOCAL',
            'wxShippingSync.conflictDetail': null
          }
        });
        return { success: true, message: '已将本地物流单号重新同步并覆盖微信' };
      }
      return { success: false, message: `同步本地信息至微信失败: ${syncRes.errmsg}` };
    }

    return { success: false, message: '未知的解决策略' };
  },

  /**
   * 7. 失败同步重试
   */
  async retryWxShippingSync(cloud, db, order) {
    const isPickup = order.deliveryType === 'PICKUP' || order.deliveryType === 'pickup';
    if (isPickup) {
      return this.syncPickupCompletion(cloud, db, order);
    } else {
      return this.syncExpressShipping(cloud, db, order, {
        trackingNo: order.trackingNo,
        logisticsCompany: order.logisticsCompany,
        logisticsCompanyCode: order.expressCompany
      });
    }
  }
};

module.exports = wxOrderShippingService;

