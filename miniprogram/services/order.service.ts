import { callCloud } from './cloud';
import { PaginatedList } from '../models/common';

/**
 * 订单列表组合状态 token（与后端 orders.list 的 status 过滤逻辑对齐）
 * 后端将部分 token 展开为多个底层状态：REFUND → REFUND_PENDING|REFUNDING；
 * PENDING_REVIEW → COMPLETED 且未评价；SHIPPED → SHIPPED|WAITING_PICKUP|READY_FOR_PICKUP。
 */
export const ORDER_STATUS_TOKEN = {
  ALL: 'ALL',                         // 全部订单
  PENDING_PAYMENT: 'PENDING_PAYMENT', // 待付款
  PAID: 'PAID',                       // 待发货（已付款未发货）
  SHIPPED: 'SHIPPED',                 // 待收货（已发货 / 待自提）
  REFUND: 'REFUND',                   // 退款中
  PENDING_REVIEW: 'PENDING_REVIEW',   // 待评价（已完成且未评价）
  COMPLETED: 'COMPLETED'              // 已完成
} as const;

export interface OrderItemSnapshot {
  productId: string;
  skuId: string;
  productName: string;
  colorName: string;
  size: number | string;
  image: string;
  unitPrice: number;
  count: number;
  totalAmount: number;
}

export interface OrderModel {
  _id?: string;
  id?: string;
  orderNo: string;
  userId: string;
  items: OrderItemSnapshot[];
  totalAmount: number;
  payAmount: number;
  deliveryType: 'DELIVERY' | 'PICKUP';
  status: 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'WAITING_PICKUP' | 'READY_FOR_PICKUP' | 'COMPLETED' | 'CANCELLED' | 'REFUNDING' | 'REFUNDED';
  // 子订单 (合并支付拆分后) 关联字段
  parentOrderId?: string;
  parentOrderNo?: string;
  subOrderNo?: string;
  merchantId?: string | null;
  shipments?: { trackingNo?: string; logisticsCompany?: string; expressCompany?: string; shippedAt?: string }[];
  pickupInfo?: {
    pointId: string;
    pointName: string;
    address?: string;
    pickupCode?: string; // 兼容历史数据，新业务不再生成与依赖
    pickupStatus?: string;
  };
  shippingAddress?: any;
  trackingNo?: string;
  createdAt: string | Date;
  // 评价相关 (reviewed=true 表示已完成且已评价，从「待评价」归入「已完成」)
  reviewed?: boolean;
  reviewRating?: number;
  reviewComment?: string;
  reviewedAt?: string | Date;
}

export interface PayOrderResult {
  success: boolean;
  status: string;
  code?: 'SUCCESS' | 'PAYMENT_CANCELLED' | 'PAYMENT_PERMISSION_DENIED' | 'PAYMENT_PREPAY_FAILED' | 'PAYMENT_SIGN_FAILED' | 'PAYMENT_PARAMETER_INVALID' | 'PAYMENT_REQUEST_FAILED' | 'PAYMENT_UNKNOWN' | 'PENDING_PAYMENT';
  message: string;
  rawError?: any;
}

export class OrderService {
  /**
   * 提交创建订单 (金额单位：分)
   */
  static async createOrder(params: {
    items: { skuId: string; count: number; cartId?: string; productId?: string; productName?: string; colorName?: string; size?: number | string; price?: number; image?: string }[];
    deliveryType?: 'DELIVERY' | 'PICKUP';
    addressId?: string;
    shippingAddress?: any;
    receiverSnapshot?: any;
    pickupPointId?: string;
    remark?: string;
    requestId?: string;
  }): Promise<{ orderId: string; orderNo: string; payAmount: number }> {
    return callCloud<{ orderId: string; orderNo: string; payAmount: number }>(
      'orders',
      'create',
      { ...params, requestId: params.requestId || `wx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` }
    );
  }

  /**
   * 获取我的订单列表
   */
  static async getList(params: { page?: number; pageSize?: number; status?: string }): Promise<PaginatedList<OrderModel>> {
    return callCloud<PaginatedList<OrderModel>>(
      'orders',
      'list',
      params
    );
  }

  /**
   * 获取订单详情
   */
  static async getDetail(idOrNo: string, extraOptions?: any): Promise<OrderModel | null> {
    return callCloud<OrderModel | null>(
      'orders',
      'detail',
      {
        id: idOrNo,
        orderId: extraOptions?.orderId || idOrNo,
        orderNo: extraOptions?.orderNo || idOrNo,
        outTradeNo: extraOptions?.outTradeNo || extraOptions?.out_trade_no || idOrNo,
        out_trade_no: extraOptions?.out_trade_no || extraOptions?.outTradeNo || idOrNo
      }
    );
  }

  /**
   * 取消订单 (仅待付款订单支持)
   */
  static async cancelOrder(id: string): Promise<void> {
    return callCloud<void>(
      'orders',
      'cancel',
      { id }
    );
  }

  /**
   * 确认收货
   */
  static async confirmReceive(id: string): Promise<void> {
    return callCloud<void>(
      'orders',
      'confirmReceive',
      { id }
    );
  }

  /**
   * 买家申请退款 (整子订单退，进入待商家审核)
   */
  static async applyRefund(id: string, reason?: string): Promise<void> {
    return callCloud<void>(
      'orders',
      'applyRefund',
      { id, reason }
    );
  }

  /**
   * 订单评价 (已完成订单 -> reviewed=true，待评价转已完成)
   */
  static async submitReview(id: string, params: { rating?: number; comment?: string }): Promise<{ status: string; reviewed: boolean }> {
    return callCloud<{ status: string; reviewed: boolean }>(
      'orders',
      'review',
      { id, rating: params.rating, comment: params.comment }
    );
  }

  /**
   * 发起真实微信支付 (严禁前端直接置为 PAID)
   * 服务端生成 APIv3 JSAPI 参数，拉起 wx.requestPayment
   * 支付完成后读取后端查单状态：只有 PAID 才为支付成功
   */
  /**
   * 发起真实微信支付 (严禁前端直接置为 PAID)
   * 服务端生成 APIv3 JSAPI 参数，拉起 wx.requestPayment
   * 严格按照 [PAY-01] ~ [PAY-13] 阶段输出诊断日志
   */
  static async payOrder(orderId: string): Promise<PayOrderResult> {
    console.log(`[PAY-01] 用户点击支付, orderId: ${orderId}`);
    console.log('[PAY-02] 开始创建支付参数');

    // 预检订单详情获取订单号与金额
    let currentOrderNo = orderId;
    let payAmountFen = 0;
    try {
      const detail = await this.getDetail(orderId);
      if (detail) {
        currentOrderNo = (detail as any).parentOrderNo || detail.orderNo || orderId;
        payAmountFen = detail.payAmount || 0;
      }
    } catch (e) {
      console.warn('[PAY] 预查订单信息提示:', e);
    }

    const currentAppId = 'wxYOUR_MINIPROGRAM_APPID';
    console.log(`[PAY-03] 当前商城订单号: ${currentOrderNo}`);
    console.log(`[PAY-04] 当前金额（分）: ${payAmountFen}`);
    console.log(`[PAY-05] 当前运行 AppID: ${currentAppId}`);

    // 1. 服务端生成微信支付参数
    console.log('[PAY-06] 调用支付云函数');
    let res: any;
    try {
      res = await callCloud<{
        orderId: string;
        orderNo: string;
        mode?: 'test' | 'wechat';
        status?: string;
        payment?: {
          timeStamp: string;
          nonceStr: string;
          package: string;
          signType: 'MD5' | 'HMAC-SHA256' | 'RSA';
          paySign: string;
        };
      }>('payment', 'createPayment', { orderId: currentOrderNo });
      console.log('[PAY-07] 云函数成功返回, res:', {
        orderId: res?.orderId,
        orderNo: res?.orderNo,
        mode: res?.mode,
        hasPayment: !!res?.payment
      });
    } catch (createErr: any) {
      console.error('[PAYMENT FAILED] [PAY-06-FAIL] payment 云函数抛出异常:', {
        errMsg: createErr?.errMsg || createErr?.message,
        errno: createErr?.errno,
        errCode: createErr?.errCode || createErr?.code,
        requestID: createErr?.requestID,
        message: createErr?.message,
        detail: createErr
      });

      const msg = String(createErr?.message || createErr?.errMsg || '');
      const errCodeStr = String(createErr?.errCode || createErr?.code || '');
      let code: any = 'PAYMENT_PREPAY_FAILED';
      if (/access denied|no permission|banned|jsapi has no permission|支付功能暂时无法使用|小程序违规/i.test(msg)) {
        code = 'PAYMENT_PERMISSION_DENIED';
      } else if (/WECHAT_PAY_API_TIMEOUT/i.test(msg) || errCodeStr === 'WECHAT_PAY_API_TIMEOUT') {
        code = 'WECHAT_PAY_API_TIMEOUT';
      } else if (/timeout|-504002|TIME_LIMIT_EXCEEDED/i.test(msg) || /timeout|-504002/i.test(errCodeStr)) {
        code = 'CLOUD_FUNCTION_TIMEOUT';
      }

      return {
        success: false,
        status: 'PENDING_PAYMENT',
        code,
        message: msg || '发起支付失败，未获取到支付参数',
        rawError: createErr
      };
    }

    const packageStr = res?.payment?.package || '';
    const hasPrepay = typeof packageStr === 'string' && packageStr.startsWith('prepay_id=') && packageStr.length > 10;
    console.log(`[PAY-08] 是否获得 prepay_id: ${hasPrepay ? 'true' : 'false'}${hasPrepay ? ` (${packageStr.slice(0, 24)}...)` : ''}`);

    if (res?.mode === 'test' && !res.payment) {
      return {
        success: false,
        status: res.status || 'PENDING_PAYMENT',
        code: 'PENDING_PAYMENT',
        message: '测试订单请由管理后台确认付款',
        rawError: res
      };
    }

    if (!res || !res.payment || !hasPrepay) {
      console.error('[PAYMENT FAILED] [PAY-08-FAIL] 未取得有效 prepay_id:', res);
      return {
        success: false,
        status: 'PENDING_PAYMENT',
        code: 'PAYMENT_PREPAY_FAILED',
        message: res?.message || '未获取到微信支付预下单 prepay_id',
        rawError: res
      };
    }

    const payment = res.payment;

    // 参数合规性严格检查
    if (!payment.timeStamp || typeof payment.timeStamp !== 'string' ||
        !payment.nonceStr ||
        !payment.package || !payment.package.startsWith('prepay_id=') ||
        !payment.paySign) {
      console.error('[PAYMENT FAILED] [PAY-09-FAIL] 支付调起参数校验不合格:', payment);
      return {
        success: false,
        status: 'PENDING_PAYMENT',
        code: 'PAYMENT_PARAMETER_INVALID',
        message: '微信支付参数格式校验异常',
        rawError: payment
      };
    }

    console.log('[PAY-09] payment params ready:', {
      timeStamp: payment.timeStamp,
      nonceStr: payment.nonceStr,
      packagePrefix: payment.package.slice(0, 22) + '...',
      signType: payment.signType,
      hasPaySign: !!payment.paySign
    });

    // 2. 调起原生微信支付控件
    console.log('[PAY-10] 调用 wx.requestPayment');
    try {
      await new Promise<void>((resolve, reject) => {
        wx.requestPayment({
          timeStamp: payment.timeStamp,
          nonceStr: payment.nonceStr,
          package: payment.package,
          signType: payment.signType,
          paySign: payment.paySign,
          success: () => {
            console.log('[PAY-11] wx.requestPayment success');
            resolve();
          },
          fail: (err) => {
            console.error('[PAY-12] wx.requestPayment fail:', err);
            reject(err);
          },
          complete: () => {
            console.log('[PAY-13] wx.requestPayment complete');
          }
        });
      });
    } catch (rawErr: any) {
      const errMsg = String(rawErr?.errMsg || rawErr?.message || '');
      const errno = rawErr?.errno;
      const errCode = rawErr?.errCode || rawErr?.code;

      console.error('[PAYMENT FAILED]', {
        errMsg,
        errno,
        errCode,
        detail: rawErr
      });

      if (errMsg.includes('cancel')) {
        return {
          success: false,
          status: 'PENDING_PAYMENT',
          code: 'PAYMENT_CANCELLED',
          message: '支付已取消',
          rawError: rawErr
        };
      }

      const isPermissionDenied = /access denied|no permission|banned|jsapi has no permission|支付功能暂时无法使用|小程序违规/i.test(errMsg);
      if (isPermissionDenied) {
        console.error('[PAYMENT_PERMISSION_DENIED] 微信官方拦截（非代码语法错误，属于类目资质/平台交易合规管理限制）:', rawErr);
        return {
          success: false,
          status: 'PENDING_PAYMENT',
          code: 'PAYMENT_PERMISSION_DENIED',
          message: `微信支付受限: ${errMsg}`,
          rawError: rawErr
        };
      }

      return {
        success: false,
        status: 'PENDING_PAYMENT',
        code: 'PAYMENT_REQUEST_FAILED',
        message: `调起支付失败: ${errMsg || '未知错误'}`,
        rawError: rawErr
      };
    }

    // 3. 严格查询后端确认支付状态 (防伪造、防未入账)
    try {
      const queryRes = await callCloud<{ orderId: string; orderNo: string; status: string }>(
        'payment',
        'queryOrder',
        { orderId: currentOrderNo }
      );
      if (queryRes && queryRes.status === 'PAID') {
        return { success: true, status: 'PAID', code: 'SUCCESS', message: '支付成功' };
      }
      return {
        success: false,
        status: queryRes?.status || 'PENDING_PAYMENT',
        code: 'PENDING_PAYMENT',
        message: '支付确认中，请稍后在订单详情刷新'
      };
    } catch (e: any) {
      console.warn('[payOrder] queryOrder check warning:', e);
      return {
        success: false,
        status: 'PENDING_PAYMENT',
        code: 'PENDING_PAYMENT',
        message: '支付确认中，请稍后在订单详情刷新'
      };
    }
  }
}

