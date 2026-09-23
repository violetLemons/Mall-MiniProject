import React, { useState, useEffect } from 'react';
import { AdminApi } from '../api/client';
import { ProductAuditTicket, Category } from '../types';
import { Badge } from '../components/Badge';
import { useToast } from '../components/Toast';
import { formatCents } from '../utils/format';
import { Modal } from '../components/Modal';
import { ClipboardCheck, Check, X, Eye } from 'lucide-react';

const STATUS_META: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'default' }> = {
  PENDING: { label: '待审核', variant: 'warning' },
  APPROVED: { label: '已通过', variant: 'success' },
  REJECTED: { label: '已驳回', variant: 'danger' }
};

export const AuditTickets: React.FC = () => {
  const { toast } = useToast();
  const user = AdminApi.getCurrentUser();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [tickets, setTickets] = useState<ProductAuditTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [processing, setProcessing] = useState<string | null>(null);
  const [detailTicket, setDetailTicket] = useState<ProductAuditTicket | null>(null);
  const [approveTicket, setApproveTicket] = useState<ProductAuditTicket | null>(null);
  const [approveFee, setApproveFee] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await AdminApi.getAuditTickets(statusFilter === 'ALL' ? undefined : statusFilter);
      setTickets(list);
    } catch (err: any) {
      toast(err.message || '加载审核工单失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const list = await AdminApi.getCategories();
      setCategories(Array.isArray(list) ? list : []);
    } catch {
      setCategories([]);
    }
  };

  useEffect(() => {
    loadData();
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleOpenApprove = (ticket: ProductAuditTicket) => {
    setApproveFee('');
    setApproveTicket(ticket);
  };

  const handleConfirmApprove = async () => {
    if (!approveTicket) return;
    const feeYuan = Number(approveFee);
    if (isNaN(feeYuan) || feeYuan < 0) {
      toast('请输入有效的平台抽成金额（每件，元）', 'error');
      return;
    }
    const platformFee = Math.round(feeYuan * 100);
    setProcessing(approveTicket.id);
    try {
      await AdminApi.reviewTicket(approveTicket.id, 'approve', platformFee);
      toast('已通过审核，平台抽成已写入', 'success');
      setApproveTicket(null);
      setDetailTicket(null);
      await loadData();
    } catch (err: any) {
      toast(err.message || '审核通过失败', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (ticket: ProductAuditTicket): Promise<boolean> => {
    const reason = window.prompt('请输入驳回原因（必填，商家可见）：');
    if (reason === null) return false;
    if (!reason.trim()) {
      toast('驳回原因不能为空', 'error');
      return false;
    }
    setProcessing(ticket.id);
    try {
      await AdminApi.reviewTicket(ticket.id, 'reject', 0, reason.trim());
      toast('已驳回该审核工单', 'success');
      await loadData();
      return true;
    } catch (err: any) {
      toast(err.message || '驳回失败', 'error');
      return false;
    } finally {
      setProcessing(null);
    }
  };

  const openDetail = (ticket: ProductAuditTicket) => setDetailTicket(ticket);

  const rejectFromModal = async () => {
    if (!detailTicket) return;
    if (await handleReject(detailTicket)) setDetailTicket(null);
  };

  const detailProduct = detailTicket?.payload?.product || {};
  const detailSkus = detailTicket?.payload?.skus || [];
  const detailMeta = detailTicket
    ? STATUS_META[detailTicket.status] || { label: detailTicket.status, variant: 'default' as const }
    : null;
  const categoryName = detailProduct.categoryId
    ? categories.find(c => c.id === detailProduct.categoryId)?.name || detailProduct.categoryId
    : '—';
  const detailImages = Array.isArray(detailProduct.detailImages) && detailProduct.detailImages.length > 0
    ? detailProduct.detailImages
    : Array.isArray(detailProduct.images) ? detailProduct.images : [];
  const deliveryTypes = Array.isArray(detailProduct.deliveryTypes) ? detailProduct.deliveryTypes : [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            商品审核工单 · Audit Tickets
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            {isSuper
              ? '审核商家提交的新增/修改商品工单，通过时填写「平台抽成(每件)」并上架。'
              : '查看您提交的商品审核工单进度；审核通过后商品自动上架。'}
          </p>
        </div>
      </div>

      {/* Status Tabs */}
      <div style={{ display: 'flex', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '3px', width: 'fit-content' }}>
        {[
          { label: '全部', value: 'ALL' },
          { label: '待审核', value: 'PENDING' },
          { label: '已通过', value: 'APPROVED' },
          { label: '已驳回', value: 'REJECTED' }
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value as any)}
            style={{
              padding: '6px 14px',
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

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>加载中...</div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94A3B8' }}>
            <ClipboardCheck size={32} style={{ margin: '0 auto 12px', color: '#CBD5E1' }} />
            暂无审核工单
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <tr style={{ color: '#64748B' }}>
                <th style={{ padding: '14px 18px' }}>工单类型</th>
                <th style={{ padding: '14px 18px' }}>商品信息</th>
                {isSuper && <th style={{ padding: '14px 18px' }}>商家ID</th>}
                <th style={{ padding: '14px 18px' }}>平台抽成(每件)</th>
                <th style={{ padding: '14px 18px' }}>状态</th>
                <th style={{ padding: '14px 18px' }}>提交时间</th>
                {isSuper && <th style={{ padding: '14px 18px', textAlign: 'right' }}>审核操作</th>}
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => {
                const prod = t.payload?.product || {};
                const meta = STATUS_META[t.status] || { label: t.status, variant: 'default' as const };
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: t.type === 'CREATE' ? '#EFF6FF' : '#F5F3FF',
                          color: t.type === 'CREATE' ? '#2563EB' : '#7C3AED'
                        }}
                      >
                        {t.type === 'CREATE' ? '新增商品' : '修改商品'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {prod.cover && (
                          <img src={prod.cover} alt={prod.name} style={{ width: '44px', height: '44px', borderRadius: '8px', objectFit: 'cover' }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 700, color: '#0F172A' }}>{prod.name || '(未命名商品)'}</div>
                          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                            基准价 {formatCents(prod.minPrice)}
                          </div>
                          <button
                            onClick={() => openDetail(t)}
                            style={{
                              marginTop: '6px', padding: '3px 10px', borderRadius: '6px', border: '1px solid #CBD5E1',
                              backgroundColor: '#F8FAFC', color: '#475569', fontSize: '12px', fontWeight: 600,
                              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            <Eye size={14} /> 查看详情
                          </button>
                        </div>
                      </div>
                    </td>
                    {isSuper && <td style={{ padding: '14px 18px', color: '#475569' }}>{t.merchantId || '平台'}</td>}
                    <td style={{ padding: '14px 18px', fontWeight: 700, color: '#FF5500' }}>
                      {t.status === 'APPROVED' ? formatCents(t.platformFee) : (isSuper && t.status === 'PENDING' ? '待填写' : '—')}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <Badge status={t.status} text={meta.label} variant={meta.variant} />
                      {t.status === 'REJECTED' && t.rejectReason && (
                        <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px', maxWidth: '220px' }}>
                          原因: {t.rejectReason}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 18px', color: '#64748B' }}>{t.createdAt}</td>
                    {isSuper && (
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        {t.status === 'PENDING' ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              disabled={processing === t.id}
                              onClick={() => handleOpenApprove(t)}
                              style={{
                                padding: '6px 12px', borderRadius: '6px', border: '1px solid #A7F3D0',
                                backgroundColor: '#ECFDF5', color: '#059669', fontSize: '12px', fontWeight: 700,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <Check size={14} /> 通过
                            </button>
                            <button
                              disabled={processing === t.id}
                              onClick={() => handleReject(t)}
                              style={{
                                padding: '6px 12px', borderRadius: '6px', border: '1px solid #FECACA',
                                backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 700,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <X size={14} /> 驳回
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94A3B8' }}>已处理</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 查看详情弹窗 */}
      <Modal
        isOpen={!!detailTicket}
        onClose={() => setDetailTicket(null)}
        title="商品审核工单详情"
        width="720px"
      >
        {detailTicket && detailMeta && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* 工单信息 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                  backgroundColor: detailTicket.type === 'CREATE' ? '#EFF6FF' : '#F5F3FF',
                  color: detailTicket.type === 'CREATE' ? '#2563EB' : '#7C3AED'
                }}
              >
                {detailTicket.type === 'CREATE' ? '新增商品' : '修改商品'}
              </span>
              <Badge status={detailTicket.status} text={detailMeta.label} variant={detailMeta.variant} />
              <span style={{ fontSize: '12px', color: '#64748B' }}>商家: {detailTicket.merchantId || '平台'}</span>
              <span style={{ fontSize: '12px', color: '#64748B' }}>提交时间: {detailTicket.createdAt}</span>
            </div>

            {detailTicket.status === 'REJECTED' && detailTicket.rejectReason && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: '13px' }}>
                驳回原因：{detailTicket.rejectReason}
              </div>
            )}

            {/* 商品详情 */}
            <div style={{ display: 'flex', gap: '16px' }}>
              {detailProduct.cover && (
                <img src={detailProduct.cover} alt={detailProduct.name} style={{ width: '120px', height: '120px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#334155' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>{detailProduct.name || '(未命名商品)'}</div>
                {detailProduct.subtitle && <div style={{ fontSize: '12px', color: '#64748B' }}>{detailProduct.subtitle}</div>}
                <div>品牌：{detailProduct.brand || '—'}</div>
                <div>分类：{categoryName}</div>
                <div>
                  基准价：{formatCents(detailProduct.minPrice)}
                  {detailProduct.maxPrice !== undefined && detailProduct.maxPrice !== detailProduct.minPrice ? ` ~ ${formatCents(detailProduct.maxPrice)}` : ''}
                </div>
                <div>库存：{detailProduct.totalStock ?? '—'}</div>
                {deliveryTypes.length > 0 && (
                  <div>配送方式：{deliveryTypes.map(t => t === 'DELIVERY' ? '顺丰快递包邮' : t === 'PICKUP' ? '到店自提' : t).join('、')}</div>
                )}
                {Array.isArray(detailProduct.tags) && detailProduct.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {detailProduct.tags.map((tag: string) => (
                      <span key={tag} style={{ padding: '2px 8px', borderRadius: '999px', backgroundColor: '#F1F5F9', fontSize: '11px', color: '#475569' }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {detailProduct.description && (
              <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>商品描述</div>
                {detailProduct.description}
              </div>
            )}

            {detailImages.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {detailImages.map((img: string, i: number) => (
                  <img key={i} src={img} alt="" style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover' }} />
                ))}
              </div>
            )}

            {/* SKU 列表 */}
            {detailSkus.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '14px', marginBottom: '8px' }}>规格 SKU（{detailSkus.length}）</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F8FAFC', color: '#64748B' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>颜色/规格</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>尺码</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>价格</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>库存</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSkus.map((s: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 10px', color: '#334155' }}>{s.colorName || '默认'}</td>
                        <td style={{ padding: '8px 10px', color: '#334155' }}>{s.size}</td>
                        <td style={{ padding: '8px 10px', color: '#FF5500', fontWeight: 700 }}>{formatCents(s.price)}</td>
                        <td style={{ padding: '8px 10px', color: '#334155' }}>{s.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 平台审核操作 */}
            {isSuper && detailTicket.status === 'PENDING' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                <button
                  disabled={processing === detailTicket.id}
                  onClick={() => handleOpenApprove(detailTicket)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #A7F3D0', backgroundColor: '#ECFDF5', color: '#059669', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <Check size={14} /> 通过（填写抽成）
                </button>
                <button
                  disabled={processing === detailTicket.id}
                  onClick={rejectFromModal}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #FECACA', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <X size={14} /> 驳回
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 通过审核 · 填写平台抽成弹窗 */}
      <Modal
        isOpen={!!approveTicket}
        onClose={() => setApproveTicket(null)}
        title="通过审核 · 填写平台抽成"
        width="440px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
            为商品「{approveTicket?.payload?.product?.name || '(未命名商品)'}」设置平台抽成金额（每件，元），通过后自动上架。
          </p>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              平台抽成 (¥ / 每件)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              placeholder="例如: 0.50"
              value={approveFee}
              onChange={e => setApproveFee(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmApprove(); } }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setApproveTicket(null)}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              type="button"
              disabled={processing === approveTicket?.id}
              onClick={handleConfirmApprove}
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#059669', color: '#FFF', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Check size={15} /> 确认通过
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
