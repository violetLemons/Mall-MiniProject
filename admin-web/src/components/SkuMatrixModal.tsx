import React, { useState } from 'react';
import { Modal } from './Modal';
import { SkuItem } from '../types';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';

interface SkuMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  skus: SkuItem[];
  onSave: (newSkus: SkuItem[]) => void;
}

const STANDARD_SIZES = [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45];

export const SkuMatrixModal: React.FC<SkuMatrixModalProps> = ({
  isOpen,
  onClose,
  productName,
  skus: initialSkus,
  onSave
}) => {
  const [skuList, setSkuList] = useState<SkuItem[]>(initialSkus || []);
  const [batchPrice, setBatchPrice] = useState('');
  const [batchStock, setBatchStock] = useState('');
  const [newColor, setNewColor] = useState('默认配色');

  // 当外部初始数据变化时同步
  React.useEffect(() => {
    if (initialSkus && initialSkus.length > 0) {
      setSkuList(initialSkus.map(s => ({
        ...s,
        price: (s.price !== undefined && s.price !== null) ? Number((s.price / 100).toFixed(2)) : 699,
        costPrice: (s.costPrice !== undefined && s.costPrice !== null) ? Number((s.costPrice / 100).toFixed(2)) : 0
      })));
    } else {
      // 默认生成标准规格 (以元为单位)
      generateFullSizes('默认配色', 699, 20);
    }
  }, [initialSkus, isOpen]);

  const generateFullSizes = (colorName: string, defaultPrice: number = 699, defaultStock: number = 20) => {
    const generated: SkuItem[] = STANDARD_SIZES.map(size => ({
      id: `sku_gen_${size}_${Date.now()}`,
      skuId: `sku_gen_${size}_${Date.now()}`,
      colorName,
      size,
      price: defaultPrice,
      costPrice: Math.floor(defaultPrice * 0.55),
      stock: (size >= 40 && size <= 43) ? defaultStock * 2 : defaultStock,
      lockedStock: 0,
      status: 'ACTIVE'
    }));
    setSkuList(generated);
  };

  const handleApplyBatchPrice = () => {
    const p = parseFloat(batchPrice);
    if (isNaN(p) || p <= 0) return;
    setSkuList(prev => prev.map(s => ({ ...s, price: p })));
    setBatchPrice('');
  };

  const handleApplyBatchStock = () => {
    const st = parseInt(batchStock, 10);
    if (isNaN(st) || st < 0) return;
    setSkuList(prev => prev.map(s => ({ ...s, stock: st })));
    setBatchStock('');
  };

  const handleUpdateItem = (index: number, field: keyof SkuItem, val: any) => {
    setSkuList(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleRemove = (index: number) => {
    setSkuList(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddCustomSku = () => {
    setSkuList(prev => [
      ...prev,
      {
        id: `sku_custom_${Date.now()}`,
        skuId: `sku_custom_${Date.now()}`,
        colorName: newColor || '经典配色',
        size: 42,
        price: 699,
        costPrice: 380,
        stock: 30,
        lockedStock: 0,
        status: 'ACTIVE'
      }
    ]);
  };

  const handleConfirm = () => {
    const convertedSkus = skuList.map(s => ({
      ...s,
      price: Math.round(Number(s.price || 0) * 100),
      costPrice: Math.round(Number(s.costPrice || 0) * 100)
    }));
    onSave(convertedSkus);
    onClose();
  };

  const totalStock = skuList.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
  const minPrice = skuList.length > 0 ? Math.min(...skuList.map(s => Number(s.price) || 0)) : 0;
  const maxPrice = skuList.length > 0 ? Math.max(...skuList.map(s => Number(s.price) || 0)) : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`SKU 规格与库存矩阵 · ${productName}`} width="860px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Quick Batch Controls */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>一键生成:</span>
            <button
              type="button"
              onClick={() => generateFullSizes('经典配色', 699, 25)}
              style={{
                backgroundColor: '#FF5500',
                color: '#FFF',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              生成标准规格
            </button>
            <input
              type="text"
              placeholder="指定配色名称"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                width: '110px'
              }}
            />
            <button
              type="button"
              onClick={handleAddCustomSku}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#334155',
                border: '1px solid #CBD5E1',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Plus size={14} /> 添加单品
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="批量售价(如0.01)"
              value={batchPrice}
              onChange={(e) => setBatchPrice(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                width: '110px'
              }}
            />
            <button
              type="button"
              onClick={handleApplyBatchPrice}
              style={{
                backgroundColor: '#0F172A',
                color: '#FFF',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              应用售价
            </button>

            <input
              type="number"
              placeholder="批量统一库存"
              value={batchStock}
              onChange={(e) => setBatchStock(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                fontSize: '12px',
                width: '100px'
              }}
            />
            <button
              type="button"
              onClick={handleApplyBatchStock}
              style={{
                backgroundColor: '#0F172A',
                color: '#FFF',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              应用库存
            </button>
          </div>
        </div>

        {/* Matrix Table */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead style={{ backgroundColor: '#F1F5F9', position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ padding: '10px 14px', color: '#475569' }}>配色</th>
                <th style={{ padding: '10px 14px', color: '#475569' }}>规格</th>
                <th style={{ padding: '10px 14px', color: '#475569' }}>日常售价 (¥)</th>
                <th style={{ padding: '10px 14px', color: '#475569' }}>进货成本 (¥)</th>
                <th style={{ padding: '10px 14px', color: '#475569' }}>实物物理库存</th>
                <th style={{ padding: '10px 14px', color: '#475569' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {skuList.map((sku, index) => (
                <tr key={sku.id || index} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '8px 14px' }}>
                    <input
                      type="text"
                      value={sku.colorName}
                      onChange={(e) => handleUpdateItem(index, 'colorName', e.target.value)}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        fontSize: '13px',
                        width: '120px'
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <select
                      value={sku.size}
                      onChange={(e) => handleUpdateItem(index, 'size', Number(e.target.value))}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        fontSize: '13px'
                      }}
                    >
                      {STANDARD_SIZES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={sku.price}
                      onChange={(e) => handleUpdateItem(index, 'price', Number(e.target.value))}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        fontSize: '13px',
                        width: '90px'
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <input
                      type="number"
                      value={sku.costPrice || 0}
                      onChange={(e) => handleUpdateItem(index, 'costPrice', Number(e.target.value))}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        fontSize: '13px',
                        width: '80px'
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <input
                      type="number"
                      value={sku.stock}
                      onChange={(e) => handleUpdateItem(index, 'stock', Number(e.target.value))}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '6px',
                        border: sku.stock < 10 ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                        backgroundColor: sku.stock < 10 ? '#FFFBEB' : '#FFF',
                        fontSize: '13px',
                        width: '80px',
                        fontWeight: 600
                      }}
                    />
                    {sku.stock < 10 && (
                      <span style={{ fontSize: '11px', color: '#D97706', marginLeft: '6px' }}>低库存</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <button
                      type="button"
                      onClick={() => handleRemove(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Matrix Footer Summary */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '10px'
          }}
        >
          <div style={{ fontSize: '13px', color: '#64748B' }}>
            共 <strong style={{ color: '#0F172A' }}>{skuList.length}</strong> 个规格条目 | 
            价格区间: <strong style={{ color: '#FF5500' }}>¥{minPrice} ~ ¥{maxPrice}</strong> | 
            总物理库存: <strong style={{ color: '#0F172A' }}>{totalStock}</strong> 件
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
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
              type="button"
              onClick={handleConfirm}
              style={{
                padding: '9px 22px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#FF5500',
                color: '#FFF',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 6px -1px rgba(255, 85, 0, 0.25)'
              }}
            >
              <CheckCircle2 size={16} /> 确认并更新 SKU 矩阵
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
