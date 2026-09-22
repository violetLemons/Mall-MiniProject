import React from 'react';

interface BadgeProps {
  status: string;
  text?: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'default';
}

export const Badge: React.FC<BadgeProps> = ({ status, text, variant }) => {
  let v = variant;
  let label = text || status;

  if (!v) {
    switch (status) {
      case 'ON_SALE':
      case 'ACTIVE':
      case 'PAID':
      case 'COMPLETED':
        v = 'success';
        if (!text) {
          if (status === 'ON_SALE') label = '在售中';
          else if (status === 'ACTIVE') label = '正常';
          else if (status === 'PAID') label = '已付款';
          else if (status === 'COMPLETED') label = '已完成';
        }
        break;
      case 'PENDING_PAYMENT':
        v = 'warning';
        if (!text) {
          if (status === 'PENDING_PAYMENT') label = '待付款';
        }
        break;
      case 'SHIPPED':
        v = 'purple';
        if (!text) {
          if (status === 'SHIPPED') label = '已发货';
        }
        break;
      case 'REFUND_PENDING':
        v = 'warning';
        if (!text) label = '待退款审核';
        break;
      case 'REFUNDING':
        v = 'warning';
        if (!text) label = '退款中';
        break;
      case 'REFUNDED':
        v = 'default';
        if (!text) label = '已退款';
        break;
      case 'OFF_SALE':
      case 'DISABLED':
      case 'CANCELLED':
        v = 'default';
        if (!text) {
          if (status === 'OFF_SALE') label = '已下架';
          else if (status === 'DISABLED') label = '已禁用';
          else if (status === 'CANCELLED') label = '已取消';
        }
        break;
      case 'SUSPENDED':
        v = 'warning';
        if (!text) label = '下架整改中';
        break;
      case 'DELETED':
        v = 'danger';
        if (!text) label = '已删除(回收站)';
        break;
      default:
        v = 'default';
    }
  }

  const styles: Record<string, { bg: string; color: string; border: string }> = {
    success: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
    warning: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    danger: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
    info: { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
    purple: { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE' },
    default: { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' }
  };

  const style = styles[v] || styles.default;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 9px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        whiteSpace: 'nowrap'
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: style.color,
          marginRight: '6px'
        }}
      />
      {label}
    </span>
  );
};
