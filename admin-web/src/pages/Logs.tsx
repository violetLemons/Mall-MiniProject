import React, { useState, useEffect } from 'react';
import { AdminApi } from '../api/client';
import { OperationLog } from '../types';
import { FileText, ShieldAlert } from 'lucide-react';

export const Logs: React.FC = () => {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const list = await AdminApi.getOperationLogs();
        setLogs(list);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
          系统审计日志 · Audit Logs
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
          记录管理员对商品增删改查、库存调拨、顺丰发货、校园核销等所有高价值操作轨迹。
        </p>
      </div>

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
              <th style={{ padding: '14px 18px' }}>操作模块</th>
              <th style={{ padding: '14px 18px' }}>行为动作</th>
              <th style={{ padding: '14px 18px' }}>管理员 (ID)</th>
              <th style={{ padding: '14px 18px' }}>请求 IP</th>
              <th style={{ padding: '14px 18px' }}>业务行为详情</th>
              <th style={{ padding: '14px 18px' }}>记录时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: '14px 18px', fontWeight: 600, color: '#0F172A' }}>
                  {l.module}
                </td>
                <td style={{ padding: '14px 18px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#F1F5F9',
                      color: '#334155'
                    }}
                  >
                    {l.action}
                  </span>
                </td>
                <td style={{ padding: '14px 18px' }}>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{l.adminName}</div>
                  <div style={{ fontSize: '11px', color: '#94A3B8' }}>{l.adminId}</div>
                </td>
                <td style={{ padding: '14px 18px', color: '#64748B', fontFamily: 'monospace' }}>
                  {l.ip}
                </td>
                <td style={{ padding: '14px 18px', color: '#334155' }}>
                  {l.detail}
                </td>
                <td style={{ padding: '14px 18px', color: '#94A3B8', fontSize: '12px' }}>
                  {l.createdAt}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
