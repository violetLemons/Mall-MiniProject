import React, { useState, useEffect } from 'react';
import { AdminApi } from '../api/client';
import { InventoryLog, Product } from '../types';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { Boxes, PlusCircle, History, ArrowDownRight, ArrowUpRight } from 'lucide-react';

export const Inventory: React.FC = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Manual Adjust Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const [newStock, setNewStock] = useState<number>(50);
  const [adjustReason, setAdjustReason] = useState('仓库到货入库');

  const loadData = async () => {
    setLoading(true);
    try {
      const [lList, pList] = await Promise.all([
        AdminApi.getInventoryLogs(),
        AdminApi.getProducts()
      ]);
      setLogs(lList);
      setProducts(pList);
      if (pList.length > 0 && !selectedProductId) {
        setSelectedProductId(pList[0].id);
        if (pList[0].skus && pList[0].skus.length > 0) {
          setSelectedSkuId(pList[0].skus[0].skuId || pList[0].skus[0].id || '');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeProduct = products.find(p => p.id === selectedProductId);

  const handleProductSelectChange = (pid: string) => {
    setSelectedProductId(pid);
    const prod = products.find(p => p.id === pid);
    if (prod && prod.skus && prod.skus.length > 0) {
      const firstSku = prod.skus[0];
      setSelectedSkuId(firstSku.skuId || firstSku.id || '');
      setNewStock(firstSku.stock ?? 0);
    }
  };

  const handleOpenAdjustModal = () => {
    if (activeProduct && activeProduct.skus && activeProduct.skus.length > 0) {
      const currentSku = activeProduct.skus.find(s => (s.skuId || s.id) === selectedSkuId) || activeProduct.skus[0];
      setNewStock(currentSku.stock ?? 0);
    }
    setAdjustModalOpen(true);
  };

  const handleCommitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !selectedSkuId) {
      toast('请选择需要调账的商品和规格', 'error');
      return;
    }
    try {
      await AdminApi.updateSkuStock(selectedProductId, selectedSkuId, Number(newStock), adjustReason);
      toast('库存调整已实时入账，审计流水已存证！', 'success');
      setAdjustModalOpen(false);
      await loadData();
    } catch (e: any) {
      toast(e.message || '调账失败', 'error');
    }
  };

  const totalPhysicalStock = products.reduce((sum, p) => sum + p.totalStock, 0);
  const totalLockedStock = products.reduce((sum, p) => {
    const pLocked = (p.skus || []).reduce((sSum, sku) => sSum + (sku.lockedStock || 0), 0);
    return sum + pLocked;
  }, 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            库存与流水中心 · Inventory
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            原子并发防超卖锁存审计、人工入库调账与变动轨迹全链路留痕。
          </p>
        </div>

        <button
          onClick={handleOpenAdjustModal}
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
          <PlusCircle size={18} color="#FF5500" />
          <span>人工调账 / 入库</span>
        </button>
      </div>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '20px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>全仓在架总库存</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginTop: '8px' }}>
            {totalPhysicalStock} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94A3B8' }}>件</span>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '20px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>待支付锁定库存</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#F59E0B', marginTop: '8px' }}>
            {totalLockedStock} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94A3B8' }}>件 (30分钟超时自动回滚)</span>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '14px', padding: '20px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>审计流水记录数</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#3B82F6', marginTop: '8px' }}>
            {logs.length} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94A3B8' }}>条</span>
          </div>
        </div>
      </div>

      {/* Inventory Logs Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={18} color="#64748B" />
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>最近库存变动与锁存流水 (inventory_logs)</h3>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <tr style={{ color: '#64748B' }}>
              <th style={{ padding: '12px 18px' }}>变动商品与规格</th>
              <th style={{ padding: '12px 18px' }}>增减数量 (Delta)</th>
              <th style={{ padding: '12px 18px' }}>变动原因 / 类型</th>
              <th style={{ padding: '12px 18px' }}>操作人 / 触发来源</th>
              <th style={{ padding: '12px 18px' }}>详细业务备注</th>
              <th style={{ padding: '12px 18px' }}>发生时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const isPlus = log.delta > 0;
              return (
                <tr key={log.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 18px' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{log.productName}</div>
                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                      {log.colorName} / <strong style={{ color: '#FF5500' }}>{log.size}</strong>
                    </div>
                  </td>

                  <td style={{ padding: '12px 18px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 700,
                        backgroundColor: isPlus ? '#ECFDF5' : '#FEF2F2',
                        color: isPlus ? '#059669' : '#DC2626'
                      }}
                    >
                      {isPlus ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      <span>{isPlus ? `+${log.delta}` : log.delta} 件</span>
                    </span>
                  </td>

                  <td style={{ padding: '12px 18px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor:
                          log.reason === 'ORDER_LOCK' ? '#FFFBEB' :
                          log.reason === 'ORDER_CANCEL' ? '#FEF2F2' :
                          log.reason === 'RESTOCK' ? '#ECFDF5' : '#EFF6FF',
                        color:
                          log.reason === 'ORDER_LOCK' ? '#D97706' :
                          log.reason === 'ORDER_CANCEL' ? '#DC2626' :
                          log.reason === 'RESTOCK' ? '#059669' : '#2563EB',
                        fontWeight: 600
                      }}
                    >
                      {log.reason === 'ORDER_LOCK' ? '下单锁存' :
                       log.reason === 'ORDER_CANCEL' ? '取消释放' :
                       log.reason === 'RESTOCK' ? '补货入库' :
                       log.reason === 'MANUAL_ADJUST' ? '人工调账' :
                       log.reason === 'INITIAL' ? '初始建档' :
                       log.reason || '库存变更'}
                    </span>
                  </td>

                  <td style={{ padding: '12px 18px', color: '#475569' }}>
                    {log.operatorName}
                  </td>

                  <td style={{ padding: '12px 18px', color: '#64748B' }}>
                    {log.remark}
                  </td>

                  <td style={{ padding: '12px 18px', color: '#94A3B8', fontSize: '12px' }}>
                    {log.createdAt}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Manual Adjust Modal */}
      <Modal isOpen={adjustModalOpen} onClose={() => setAdjustModalOpen(false)} title="人工库存调账与补货">
        <form onSubmit={handleCommitAdjust} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              选择目标商品
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductSelectChange(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px'
              }}
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} (当前总库存: {p.totalStock})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              选择规格 (SKU)
            </label>
            <select
              value={selectedSkuId}
              onChange={(e) => {
                setSelectedSkuId(e.target.value);
                const s = activeProduct?.skus.find(item => (item.skuId || item.id) === e.target.value);
                if (s) setNewStock(s.stock);
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px'
              }}
            >
              {activeProduct?.skus.map(s => (
                <option key={s.skuId || s.id} value={s.skuId || s.id}>
                  {s.colorName} - {s.size} (当前库存: {s.stock} 件)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              校准后的新库存数量 (件)
            </label>
            <input
              type="number"
              required
              min={0}
              value={newStock}
              onChange={(e) => setNewStock(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                fontWeight: 700
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              调账入账备注 (写入审计流水)
            </label>
            <input
              type="text"
              required
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="例如: 仓库盘点盘亏 / 紧急调拨入库"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setAdjustModalOpen(false)}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFF',
                color: '#475569',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              style={{
                padding: '9px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#FF5500',
                color: '#FFF',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              确认调账并存证
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
