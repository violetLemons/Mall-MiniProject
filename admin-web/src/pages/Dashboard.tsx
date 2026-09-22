import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminApi } from '../api/client';
import { Order, Product } from '../types';
import { Badge } from '../components/Badge';
import { formatCents } from '../utils/format';
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ChevronRight
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [oList, pList] = await Promise.all([
          AdminApi.getOrders(),
          AdminApi.getProducts()
        ]);
        setOrders(oList);
        setProducts(pList);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalRevenue = orders
    .filter(o => o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + (o.payAmount || 0), 0);

  const pendingShipmentCount = orders.filter(o => o.status === 'PAID').length;
  const lowStockCount = products.filter(p => p.totalStock < 30).length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Page Title & Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
            运营数据大盘 · Overview
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            实时监控小程序端成交金额、出货履约、库存与热销动销。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/products')}
            style={{
              padding: '10px 18px',
              backgroundColor: '#FF5500',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 10px rgba(255, 85, 0, 0.25)'
            }}
          >
            <span>+ 上架新商品</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px'
        }}
      >
        {/* Card 1 */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #E2E8F0',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>总交易流水金额</span>
            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#FFF0EB', color: '#FF5500' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '12px' }}>
            ¥{formatCents(totalRevenue)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: '#10B981' }}>
            <ArrowUpRight size={16} />
            <span style={{ fontWeight: 600 }}>实时统计</span>
            <span style={{ color: '#94A3B8' }}>基于有效支付订单</span>
          </div>
        </div>

        {/* Card 2 */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #E2E8F0',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>累计成交订单</span>
            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#EFF6FF', color: '#3B82F6' }}>
              <ShoppingBag size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '12px' }}>
            {orders.length} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94A3B8' }}>单</span>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748B' }}>
            平均客单价: <strong style={{ color: '#0F172A' }}>¥{orders.length ? formatCents(Math.round(totalRevenue / orders.length)) : '0.00'}</strong>
          </div>
        </div>

        {/* Card 3 */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #E2E8F0',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>待发货</span>
            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#FFFBEB', color: '#F59E0B' }}>
              <Clock size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '12px' }}>
            {pendingShipmentCount} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94A3B8' }}>单</span>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#D97706', fontWeight: 600 }}>
            需优先处理顺丰揽件
          </div>
        </div>

        {/* Card 4 */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #E2E8F0',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>低库存预警商品</span>
            <div style={{ padding: '8px', borderRadius: '10px', backgroundColor: '#FEF2F2', color: '#EF4444' }}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '12px' }}>
            {lowStockCount} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94A3B8' }}>件</span>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#EF4444', fontWeight: 600 }}>
            {lowStockCount > 0 ? '部分热门商品亟需补货' : '目前库存健康充裕'}
          </div>
        </div>
      </div>

      {/* Main Row: Recent Orders & Top Selling Products */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* Recent Orders Table */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>最新订单履约态</h3>
            <button
              onClick={() => navigate('/orders')}
              style={{
                background: 'none',
                border: 'none',
                color: '#FF5500',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>查看全部订单</span>
              <ChevronRight size={16} />
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                <th style={{ padding: '12px 8px' }}>单号 / 买家</th>
                <th style={{ padding: '12px 8px' }}>购买商品</th>
                <th style={{ padding: '12px 8px' }}>配送方式</th>
                <th style={{ padding: '12px 8px' }}>金额</th>
                <th style={{ padding: '12px 8px' }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 5).map((o) => (
                <tr key={o.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{o.orderNo}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8' }}>{o.customerName || '微信买家'}</div>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img
                        src={o.items[0]?.image}
                        alt="cover"
                        style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover' }}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>
                          {o.items[0]?.productName.slice(0, 16)}...
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          x {o.items[0]?.count}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: '#F1F5F9',
                        color: '#475569'
                      }}
                    >
                      顺丰速运
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', fontWeight: 700, color: '#0F172A' }}>
                    ¥{formatCents(o.payAmount)}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <Badge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Hot Shoes Rank */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '16px' }}>
            热销爆款榜 · Top 4
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {products.slice(0, 4).map((p, idx) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    backgroundColor: idx === 0 ? '#FF5500' : idx === 1 ? '#0F172A' : '#E2E8F0',
                    color: idx < 2 ? '#FFF' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700
                  }}
                >
                  {idx + 1}
                </span>

                <img
                  src={p.cover}
                  alt={p.name}
                  style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                    <span>销量 {p.sales} 件</span>
                    <strong style={{ color: '#FF5500' }}>¥{formatCents(p.minPrice)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
