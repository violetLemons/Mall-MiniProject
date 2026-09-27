import React, { useState, useEffect } from 'react';
import { AdminApi } from '../api/client';
import { CardKey } from '../types';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { exportCardKeysExcel } from '../utils/excel';
import { formatCents } from '../utils/format';
import { KeyRound, Plus, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';

const PAGE_SIZE = 50;
const AMOUNT_OPTIONS = [100, 500, 1000];

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const CardKeys: React.FC = () => {
  const { toast } = useToast();
  const [cards, setCards] = useState<CardKey[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'value' | 'expireAt' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [stats, setStats] = useState({ total: 0, used: 0, expired: 0, active: 0 });

  const [modalOpen, setModalOpen] = useState(false);
  const [genValue, setGenValue] = useState(100);
  const [genCount, setGenCount] = useState(10);
  const [genExpireAt, setGenExpireAt] = useState('');
  const [generating, setGenerating] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await AdminApi.listCardKeys({ sortBy, sortOrder, page, pageSize: PAGE_SIZE });
      setCards(res.list);
      setTotal(res.total);
    } catch (err: any) {
      toast(err.message || '卡密列表加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      setStats(await AdminApi.getCardKeyStats());
    } catch (err: any) {
      console.warn('[CardKeys] stats failed:', err?.message);
    }
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortOrder]);

  const toggleSort = (key: 'value' | 'expireAt' | 'createdAt') => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const sortMark = (key: string) => (sortBy === key ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : '');

  const handleOpenCreate = () => {
    setGenValue(100);
    setGenCount(10);
    setGenExpireAt('');
    setModalOpen(true);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genCount || genCount <= 0 || genCount > 500) {
      toast('数量需在 1~500 之间', 'error');
      return;
    }
    if (!genExpireAt) {
      toast('请选择截止日期', 'error');
      return;
    }
    const expireAt = new Date(`${genExpireAt}T23:59:59`);
    if (isNaN(expireAt.getTime()) || expireAt.getTime() <= Date.now()) {
      toast('截止日期必须晚于当前时间', 'error');
      return;
    }

    setGenerating(true);
    try {
      const res = await AdminApi.generateCardKeys({
        count: genCount,
        valueYuan: genValue,
        expireAt: expireAt.toISOString()
      });
      exportCardKeysExcel(
        res.codes.map(c => ({ code: c.code, value: c.value, expireAt: c.expireAt, status: 'UNUSED' }))
      );
      toast(`已生成 ${res.codes.length} 张卡密，Excel 已下载`, 'success');
      setModalOpen(false);
      setPage(1);
      await loadList();
      await loadStats();
    } catch (err: any) {
      toast(err.message || '生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const renderStatus = (c: CardKey) => {
    if (c.status === 'USED') return <Badge status="USED" text="已兑换" variant="purple" />;
    if (c.status === 'DISABLED') return <Badge status="DISABLED" text="已失效" variant="default" />;
    if (c.expireAt && new Date(c.expireAt).getTime() < Date.now()) {
      return <Badge status="UNUSED" text="已过期" variant="warning" />;
    }
    return <Badge status="UNUSED" text="未兑换" variant="success" />;
  };

  const statCards = [
    { label: '有效期卡密', value: stats.active, color: '#2563EB', bg: '#EFF6FF' },
    { label: '已兑换卡密', value: stats.used, color: '#059669', bg: '#ECFDF5' },
    { label: '已过期卡密', value: stats.expired, color: '#D97706', bg: '#FFFBEB' }
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            卡密管理 · CardKeys
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            批量生成购物额度卡密并导出 Excel，仅系统超级管理员 (SUPER_ADMIN) 可操作。
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0F172A',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={18} color="#FF5500" />
          <span>生成卡密</span>
        </button>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {statCards.map(s => (
          <div
            key={s.label}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                backgroundColor: s.bg,
                color: s.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <KeyRound size={22} />
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                {s.value.toLocaleString()}
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 列表 */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <tr style={{ color: '#64748B' }}>
              <th style={{ padding: '14px 18px' }}>卡密</th>
              <th
                style={{ padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleSort('value')}
              >
                额度{sortMark('value')} <ArrowUpDown size={12} style={{ verticalAlign: 'middle', opacity: 0.6 }} />
              </th>
              <th
                style={{ padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleSort('expireAt')}
              >
                截止日期{sortMark('expireAt')} <ArrowUpDown size={12} style={{ verticalAlign: 'middle', opacity: 0.6 }} />
              </th>
              <th style={{ padding: '14px 18px' }}>状态</th>
              <th style={{ padding: '14px 18px' }}>批次</th>
              <th style={{ padding: '14px 18px' }}>兑换人 / 兑换时间</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                  加载中...
                </td>
              </tr>
            ) : cards.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>
                  暂无卡密，点击右上角「生成卡密」创建
                </td>
              </tr>
            ) : (
              cards.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <code style={{ fontSize: '12px', backgroundColor: '#F8FAFC', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0' }}>
                      {c.code}
                    </code>
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0F172A' }}>{formatCents(c.value)}</td>
                  <td style={{ padding: '14px 18px', color: '#475569' }}>{fmtDateTime(c.expireAt)}</td>
                  <td style={{ padding: '14px 18px' }}>{renderStatus(c)}</td>
                  <td style={{ padding: '14px 18px', color: '#64748B', fontSize: '12px' }}>{c.batchId || '—'}</td>
                  <td style={{ padding: '14px 18px', color: '#64748B' }}>
                    {c.status === 'USED' ? (
                      <>
                        <div style={{ fontSize: '12px' }}>{c.redeemedBy || '—'}</div>
                        <div style={{ fontSize: '12px', color: '#94A3B8' }}>{fmtDateTime(c.redeemedAt)}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* 分页 */}
        {total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: '13px', color: '#64748B' }}>共 {total} 条</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#FFF', color: page <= 1 ? '#CBD5E1' : '#334155', cursor: page <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}
              >
                <ChevronLeft size={14} /> 上一页
              </button>
              <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', backgroundColor: '#FFF', color: page >= totalPages ? '#CBD5E1' : '#334155', cursor: page >= totalPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}
              >
                下一页 <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 生成弹窗 */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="生成购物额度卡密">
        <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              购物额度
            </label>
            <select
              value={genValue}
              onChange={(e) => setGenValue(Number(e.target.value))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            >
              {AMOUNT_OPTIONS.map(v => (
                <option key={v} value={v}>{v} 元</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              生成数量（1~500）
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={genCount}
              onChange={(e) => setGenCount(Number(e.target.value))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              截止日期
            </label>
            <input
              type="date"
              required
              value={genExpireAt}
              onChange={(e) => setGenExpireAt(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
            />
            <p style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              卡密在截止日期当天 23:59:59 前可兑换，之后视为过期。
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFF', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={generating}
              style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#0F172A', color: '#FFF', fontSize: '14px', fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}
            >
              {generating ? '生成中...' : '生成并导出 Excel'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
