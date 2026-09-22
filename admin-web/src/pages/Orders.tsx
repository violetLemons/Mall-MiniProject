import React, { useState, useEffect } from 'react';
import { AdminApi } from '../api/client';
import { Order } from '../types';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { formatCents } from '../utils/format';
import {
  Search,
  Truck,
  Eye,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

export const Orders: React.FC = () => {
  const { toast } = useToast();
  const isMerchant = AdminApi.getCurrentUser()?.role === 'MERCHANT';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deliveryFilter, setDeliveryFilter] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [syncingWechat, setSyncingWechat] = useState(false);

  // Shipping Modal
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [activeOrderForShip, setActiveOrderForShip] = useState<Order | null>(null);
  const [trackingNo, setTrackingNo] = useState('');
  const [logisticsCompany, setLogisticsCompany] = useState('极速快递');

  // Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [activeOrderDetail, setActiveOrderDetail] = useState<Order | null>(null);

  // Conflict Modal
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [activeOrderForConflict, setActiveOrderForConflict] = useState<Order | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const list = await AdminApi.getOrders({
        status: statusFilter,
        deliveryType: deliveryFilter,
        keyword: searchKeyword
      });
      setOrders(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter, deliveryFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrders();
  };

  // 批量同步微信发货状态
  const handleSyncWithWechat = async () => {
    setSyncingWechat(true);
    try {
      const res = await AdminApi.syncWithWechat();
      toast(res.message || '微信订单发货状态对账完成', 'success');
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '微信状态对账失败', 'error');
    } finally {
      setSyncingWechat(false);
    }
  };

  // 单单同步微信发货状态
  const handleSingleOrderSync = async (order: Order) => {
    try {
      const res = await AdminApi.syncWithWechat(order.id);
      toast(res.message || `订单 [${order.orderNo}] 微信状态已同步`, 'success');
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '微信状态对账失败', 'error');
    }
  };

  // Open Ship Modal
  const handleOpenShipModal = (order: Order) => {
    setActiveOrderForShip(order);
    setTrackingNo('');
    setLogisticsCompany('极速快递');
    setShipModalOpen(true);
  };

  const handleCommitShip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrderForShip || !trackingNo.trim()) return;
    try {
      await AdminApi.shipSubOrder(activeOrderForShip.id, trackingNo.trim(), logisticsCompany);
      toast(`订单 [${activeOrderForShip.orderNo}] 已发货，${logisticsCompany}单号: ${trackingNo.trim()}`, 'success');
      setShipModalOpen(false);
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '发货失败', 'error');
    }
  };

  const handleRetryShippingSync = async (order: Order) => {
    try {
      const res = await AdminApi.retryShippingSync(order.id);
      toast(res.message || '微信履约同步已触发', 'success');
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '微信履约同步重试失败', 'error');
    }
  };

  // 冲突解决处理
  const handleOpenConflictModal = (order: Order) => {
    setActiveOrderForConflict(order);
    setConflictModalOpen(true);
  };

  const handleResolveConflict = async (resolution: 'USE_WECHAT' | 'USE_LOCAL') => {
    if (!activeOrderForConflict) return;
    try {
      const res = await AdminApi.resolveShippingConflict(activeOrderForConflict.id, resolution);
      toast(res.message || '冲突已处理', 'success');
      setConflictModalOpen(false);
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '处理冲突失败', 'error');
    }
  };

  const handleTestPay = async (order: Order) => {
    if (!window.confirm(`确认将测试订单 [${order.orderNo}] 标记为测试已付款？`)) return;
    try {
      await AdminApi.testPayOrder(order.id);
      toast(`测试订单 [${order.orderNo}] 已付款，库存已按交易规则扣减`, 'success');
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '测试付款失败', 'error');
    }
  };

  const handleTestRefund = async (order: Order) => {
    if (!window.confirm(`确认对测试订单 [${order.orderNo}] 发起测试退款？`)) return;
    try {
      await AdminApi.testRefundOrder(order.id);
      toast(`测试订单 [${order.orderNo}] 已退款，库存已恢复`, 'success');
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '测试退款失败', 'error');
    }
  };

  // 商家审核退款申请 (同意 -> REFUNDING / 拒绝 -> 回退)
  const handleReviewRefund = async (order: Order, decision: 'APPROVE' | 'REJECT') => {
    if (!window.confirm(decision === 'APPROVE' ? `确认同意订单 [${order.orderNo}] 的退款申请？` : `确认拒绝订单 [${order.orderNo}] 的退款申请？`)) return;
    try {
      await AdminApi.reviewRefund(order.id, decision);
      toast(decision === 'APPROVE' ? '已同意退款，等待平台执行' : '已拒绝退款申请', 'success');
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '退款审核操作失败', 'error');
    }
  };

  // 平台执行真实退款 (整子订单)
  const handleExecuteRefund = async (order: Order) => {
    if (!window.confirm(`确认对订单 [${order.orderNo}] 执行微信部分退款？库存与销量将回退。`)) return;
    try {
      await AdminApi.executeRefund(order.id);
      toast(`订单 [${order.orderNo}] 已退款，库存已恢复`, 'success');
      await loadOrders();
    } catch (e: any) {
      toast(e.message || '执行退款失败', 'error');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            订单履约中心 · Orders
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            极速快递发货与微信小程序发货双向同步。
          </p>
        </div>

        <button
          onClick={handleSyncWithWechat}
          disabled={syncingWechat}
          style={{
            padding: '9px 18px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: syncingWechat ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
          }}
        >
          <RefreshCw size={15} className={syncingWechat ? 'animate-spin' : ''} />
          <span>{syncingWechat ? '正在与微信对账...' : '同步微信发货状态'}</span>
        </button>
      </div>

      {/* Toolbar Filter */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          padding: '16px 20px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap'
        }}
      >
        <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
            <input
              type="text"
              placeholder="搜索订单号、收货人姓名、手机号码..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '9px 18px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            筛选
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Delivery Type Filter */}
          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '3px' }}>
            {[
              { label: '全部方式', value: 'ALL' },
              { label: '极速快递', value: 'DELIVERY' }
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setDeliveryFilter(tab.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: deliveryFilter === tab.value ? '#FFFFFF' : 'transparent',
                  color: deliveryFilter === tab.value ? '#0F172A' : '#64748B',
                  boxShadow: deliveryFilter === tab.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '3px' }}>
            {[
              { label: '全部状态', value: 'ALL' },
              { label: '待发货', value: 'PAID' },
              { label: '已发货', value: 'SHIPPED' },
              { label: '已完成', value: 'COMPLETED' },
              { label: '已取消', value: 'CANCELLED' }
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: statusFilter === tab.value ? '#FFFFFF' : 'transparent',
                  color: statusFilter === tab.value ? '#0F172A' : '#64748B',
                  boxShadow: statusFilter === tab.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders Table with responsive horizontal scrolling */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          overflowX: 'auto',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <tr style={{ color: '#64748B' }}>
              <th style={{ padding: '14px 18px' }}>订单号与时间</th>
              <th style={{ padding: '14px 18px' }}>所购商品明细</th>
              <th style={{ padding: '14px 18px' }}>买家信息</th>
              <th style={{ padding: '14px 18px' }}>配送与履约状态</th>
              <th style={{ padding: '14px 18px' }}>实付金额</th>
              <th style={{ padding: '14px 18px' }}>状态</th>
              <th style={{ padding: '14px 18px', textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
                  暂无匹配的订单
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{o.orderNo}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{o.createdAt}</div>
                  </td>

                  <td style={{ padding: '14px 18px' }}>
                    {o.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: idx > 0 ? '4px' : 0 }}>
                        <img
                          src={item.image}
                          alt="item"
                          style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: '#1E293B' }}>{item.productName.slice(0, 18)}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {item.colorName} / <strong style={{ color: '#FF5500' }}>{item.size}码</strong> x {item.count}
                          </div>
                        </div>
                      </div>
                    ))}
                  </td>

                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{o.customerName || '微信买家'}</div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>{o.customerPhone || '未填写手机号'}</div>
                  </td>

                  <td style={{ padding: '14px 18px' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                        {o.logisticsCompany || '极速快递'}
                      </span>
                      {(o.shipments && o.shipments.length > 0) ? (
                        o.shipments.map((sh, i) => (
                          <div key={i} style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                            单号{i + 1}: {sh.trackingNo} ({sh.logisticsCompany || sh.expressCompany || o.logisticsCompany || '极速快递'})
                          </div>
                        ))
                      ) : (
                        o.trackingNo && (
                          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                            单号: {o.trackingNo}
                          </div>
                        )
                      )}
                    </div>

                    {/* 微信发货管理双向同步状态展示 */}
                    {(o.status === 'SHIPPED' || o.status === 'COMPLETED' || o.wxShippingSync?.status) && (
                      <div style={{ marginTop: '4px' }}>
                        {(o.wxShippingSync?.status === 'synced' || o.wxShippingSync?.status === 'SUCCESS' || o.shippingSyncStatus === 'SHIPPING_SYNC_SUCCESS') ? (
                          <span style={{ fontSize: '10px', color: '#059669', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '4px', display: 'inline-block' }}>
                            ✓ 微信已同步 {o.wxShippingSync?.source === 'wechat' ? '(微信端)' : ''}
                          </span>
                        ) : (o.wxShippingSync?.status === 'conflict' || o.shippingSyncStatus === 'SHIPPING_SYNC_CONFLICT') ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '10px', color: '#D97706', backgroundColor: '#FEF3C7', padding: '1px 6px', borderRadius: '4px', display: 'inline-block' }}>
                              ⚠ 微信与本地物流不一致
                            </span>
                            <button
                              onClick={() => handleOpenConflictModal(o)}
                              style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', border: '1px solid #FCD34D', backgroundColor: '#FFFBEB', color: '#B45309', cursor: 'pointer', fontWeight: 700 }}
                            >
                              处理冲突
                            </button>
                          </div>
                        ) : (o.wxShippingSync?.status === 'failed' || o.wxShippingSync?.status === 'FAILED' || o.shippingSyncStatus === 'SHIPPING_SYNC_FAILED') ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '10px', color: '#DC2626', backgroundColor: '#FEF2F2', padding: '1px 6px', borderRadius: '4px', display: 'inline-block' }} title={o.wxShippingSync?.lastErrorMessage || o.shippingSyncError || '同步异常'}>
                              微信同步失败
                            </span>
                            <button
                              onClick={() => handleRetryShippingSync(o)}
                              style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', border: '1px solid #BFDBFE', backgroundColor: '#EFF6FF', color: '#2563EB', cursor: 'pointer' }}
                            >
                              重新同步微信
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 6px', borderRadius: '4px', display: 'inline-block' }}>
                            微信发货待同步
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>
                    ¥{formatCents(o.payAmount)}
                  </td>

                  <td style={{ padding: '14px 18px' }}>
                    <Badge status={o.status} />
                  </td>

                  <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        onClick={() => { setActiveOrderDetail(o); setDetailModalOpen(true); }}
                        title="查看详情"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFF',
                          color: '#334155',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Eye size={14} />
                      </button>

                      {/* 单单微信对账按钮 */}
                      <button
                        onClick={() => handleSingleOrderSync(o)}
                        title="向微信查询并同步发货状态"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0',
                          backgroundColor: '#F8FAFC',
                          color: '#475569',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <RefreshCw size={12} />
                        <span>对账</span>
                      </button>

                      {/* 快递发货操作 (PAID 首批发货 / SHIPPED 追加快递单号) */}
                      {(o.status === 'PAID' || o.status === 'SHIPPED') && o.deliveryType === 'DELIVERY' && (
                        <button
                          onClick={() => handleOpenShipModal(o)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            backgroundColor: '#FF5500',
                            color: '#FFF',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Truck size={14} />
                          <span>{o.status === 'PAID' ? '立即发货' : '追加单号'}</span>
                        </button>
                      )}

                      {/* 隔离测试支付 */}
                      {o.isTest && o.status === 'PENDING_PAYMENT' && (
                        <button
                          onClick={() => handleTestPay(o)}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #BFDBFE', backgroundColor: '#EFF6FF', color: '#2563EB', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          测试付款
                        </button>
                      )}
                      {o.isTest && o.status === 'PAID' && (
                        <button
                          onClick={() => handleTestRefund(o)}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #FECACA', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          测试退款
                        </button>
                      )}

                      {/* 退款审核：商家同意/拒绝 (整子订单) */}
                      {isMerchant && o.status === 'REFUND_PENDING' && (
                        <>
                          <button
                            onClick={() => handleReviewRefund(o, 'APPROVE')}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #A7F3D0', backgroundColor: '#ECFDF5', color: '#059669', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            同意退款
                          </button>
                          <button
                            onClick={() => handleReviewRefund(o, 'REJECT')}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #FECACA', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            拒绝退款
                          </button>
                        </>
                      )}

                      {/* 平台执行退款 (整子订单) */}
                      {!isMerchant && o.status === 'REFUNDING' && (
                        <button
                          onClick={() => handleExecuteRefund(o)}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#DC2626', color: '#FFF', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          执行退款
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Ship Modal */}
      <Modal isOpen={shipModalOpen} onClose={() => setShipModalOpen(false)} title="订单发货处理与微信履约同步">
        <form onSubmit={handleCommitShip} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              订单号
            </label>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{activeOrderForShip?.orderNo}</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              收件地址
            </label>
            <div style={{ fontSize: '13px', color: '#475569', backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '8px' }}>
              {activeOrderForShip?.shippingAddress
                ? `${activeOrderForShip.shippingAddress.province || ''} ${activeOrderForShip.shippingAddress.city || ''} ${activeOrderForShip.shippingAddress.district || ''} ${activeOrderForShip.shippingAddress.detail || ''} (${activeOrderForShip.shippingAddress.receiverName || activeOrderForShip.shippingAddress.name || '微信买家'} 收 / ${activeOrderForShip.shippingAddress.phone})`
                : '顾客微信默认地址'}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              快递物流公司
            </label>
            <select
              value={logisticsCompany}
              onChange={(e) => setLogisticsCompany(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                fontWeight: 600,
                backgroundColor: '#FFF'
              }}
            >
              <option value="极速快递">极速快递</option>
              <option value="顺丰速运">顺丰速运</option>
              <option value="中通快递">中通快递</option>
              <option value="圆通速递">圆通速递</option>
              <option value="韵达速递">韵达速递</option>
              <option value="极兔速递">极兔速递</option>
              <option value="邮政EMS">邮政EMS</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              快递物流运单号
            </label>
            <input
              type="text"
              required
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              placeholder="请输入实际运单号（如 SF1234567890）"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                fontWeight: 600
              }}
            />
            <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              发货后服务端将保存本地物流信息，并同步调用微信小程序【发货信息管理服务】API 上报微信。
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setShipModalOpen(false)}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              type="submit"
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#FF5500', color: '#FFF', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              确认发货并同步微信
            </button>
          </div>
        </form>
      </Modal>

      {/* 物流冲突裁决 Modal */}
      <Modal
        isOpen={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        title="物流信息冲突人工核对与裁决"
      >
        {activeOrderForConflict && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                backgroundColor: '#FEF3C7',
                border: '1px solid #FDE68A',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '13px',
                color: '#92400E',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>检测到微信与本地物流信息不一致！</strong>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#B45309' }}>
                  订单 [<strong>{activeOrderForConflict.orderNo}</strong>] 在微信公众平台与商城本地均记录为已发货，但快递承运商或运单号存在差异。系统已严格杜绝静默覆盖，请核对真实发货凭据后进行裁决：
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {/* 本地记录 */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  padding: '14px'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  📦 商城后台本地记录
                </div>
                <div style={{ fontSize: '13px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>承运公司：<strong>{activeOrderForConflict.wxShippingSync?.conflictDetail?.local?.logisticsCompany || activeOrderForConflict.logisticsCompany || '极速快递'}</strong></div>
                  <div>运单编号：<code style={{ backgroundColor: '#EDF2F7', padding: '2px 6px', borderRadius: '4px' }}>{activeOrderForConflict.wxShippingSync?.conflictDetail?.local?.trackingNo || activeOrderForConflict.trackingNo || '无'}</code></div>
                </div>
              </div>

              {/* 微信记录 */}
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  borderRadius: '10px',
                  border: '1px solid #BBF7D0',
                  padding: '14px'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '8px' }}>
                  🟢 微信公众平台记录
                </div>
                <div style={{ fontSize: '13px', color: '#166534', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>承运公司：<strong>{activeOrderForConflict.wxShippingSync?.conflictDetail?.wechat?.logisticsCompany || activeOrderForConflict.wxShippingSync?.conflictDetail?.wechat?.expressCompany || '微信平台已录入'}</strong></div>
                  <div>运单编号：<code style={{ backgroundColor: '#DCFCE7', padding: '2px 6px', borderRadius: '4px' }}>{activeOrderForConflict.wxShippingSync?.conflictDetail?.wechat?.trackingNo || '无'}</code></div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setConflictModalOpen(false)}
                style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                暂不处理
              </button>
              <button
                type="button"
                onClick={() => handleResolveConflict('USE_WECHAT')}
                style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #16A34A', backgroundColor: '#DCFCE7', color: '#15803D', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                以微信侧为准 (更新本地)
              </button>
              <button
                type="button"
                onClick={() => handleResolveConflict('USE_LOCAL')}
                style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#FF5500', color: '#FFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                以本地为准 (重新覆盖微信)
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Order Detail Modal */}
      <Modal isOpen={detailModalOpen} onClose={() => setDetailModalOpen(false)} title={`订单详情 · ${activeOrderDetail?.orderNo || ''}`}>
        {activeOrderDetail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#64748B' }}>下单时间：{activeOrderDetail.createdAt}</span>
              </div>
              <Badge status={activeOrderDetail.status} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>买家与配送信息</h4>
                <div style={{ fontSize: '13px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>买家：{activeOrderDetail.customerName || '微信买家'}</div>
                  <div>手机：{activeOrderDetail.customerPhone || '未填写'}</div>
                  <div>配送方式：极速快递</div>
                  {activeOrderDetail.trackingNo && <div>运单号：{activeOrderDetail.trackingNo} ({activeOrderDetail.logisticsCompany})</div>}
                </div>
              </div>

              <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>微信发货管理双向同步状态</h4>
                <div style={{ fontSize: '13px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {(activeOrderDetail.wxShippingSync?.status === 'synced' || activeOrderDetail.wxShippingSync?.status === 'SUCCESS' || activeOrderDetail.shippingSyncStatus === 'SHIPPING_SYNC_SUCCESS') ? (
                      <span style={{ color: '#059669', fontWeight: 700 }}>
                        ✓ 已同步微信 {activeOrderDetail.wxShippingSync?.source === 'wechat' ? '(微信后台发货反向对账)' : '(商城后台发货上报)'}
                      </span>
                    ) : (activeOrderDetail.wxShippingSync?.status === 'conflict' || activeOrderDetail.shippingSyncStatus === 'SHIPPING_SYNC_CONFLICT') ? (
                      <span style={{ color: '#D97706', fontWeight: 700 }}>
                        ⚠ 微信与本地物流信息不一致 (需人工核对)
                      </span>
                    ) : (activeOrderDetail.wxShippingSync?.status === 'failed' || activeOrderDetail.wxShippingSync?.status === 'FAILED' || activeOrderDetail.shippingSyncStatus === 'SHIPPING_SYNC_FAILED') ? (
                      <span style={{ color: '#DC2626', fontWeight: 700 }}>
                        ✗ 同步失败: {activeOrderDetail.wxShippingSync?.lastErrorMessage || activeOrderDetail.shippingSyncError || '接口未开通或异常'}
                      </span>
                    ) : (
                      <span style={{ color: '#64748B' }}>尚未触发或待同步</span>
                    )}
                  </div>
                  {activeOrderDetail.wxShippingSync?.syncedAt && (
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                      最近对账时间：{new Date(activeOrderDetail.wxShippingSync.syncedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                {(activeOrderDetail.status === 'SHIPPED' || activeOrderDetail.status === 'COMPLETED') && (
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={async () => {
                        await handleRetryShippingSync(activeOrderDetail);
                        setDetailModalOpen(false);
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFF',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      重新同步微信发货
                    </button>
                    <button
                      onClick={async () => {
                        await handleSingleOrderSync(activeOrderDetail);
                        setDetailModalOpen(false);
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid #0F172A',
                        backgroundColor: '#0F172A',
                        color: '#FFF',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      查询微信状态对账
                    </button>
                  </div>
                )}
              </div>
            </div>

            <h4 style={{ fontSize: '14px', fontWeight: 700 }}>商品规格清单</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeOrderDetail.items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                  <img src={it.image} alt="" style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{it.productName}</div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>{it.colorName} / {it.size}码</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>¥{formatCents(it.unitPrice)} x {it.count}</div>
                    <strong style={{ color: '#FF5500' }}>¥{formatCents(it.totalAmount)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

