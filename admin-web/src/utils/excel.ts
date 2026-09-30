import * as XLSX from 'xlsx';
import { Order } from '../types';

export interface CardKeyExportRow {
  code: string;
  value: number; // 分
  expireAt?: string | null; // ISO
  status?: string;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function statusText(status?: string): string {
  if (status === 'USED') return '已兑换';
  if (status === 'DISABLED') return '已失效';
  return '未兑换';
}

export function exportCardKeysExcel(codes: CardKeyExportRow[], fileName = '卡密导出.xlsx'): void {
  const header = ['卡密', '额度(元)', '截止日期', '状态'];
  const rows = codes.map(c => [
    c.code,
    (Number(c.value || 0) / 100).toFixed(2),
    formatDateTime(c.expireAt) || '永久',
    statusText(c.status)
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 42 }, { wch: 10 }, { wch: 20 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '卡密');
  XLSX.writeFile(wb, fileName);
}

function orderStatusText(status?: string): string {
  const map: Record<string, string> = {
    PENDING_PAYMENT: '待付款',
    PAID: '待发货',
    SHIPPED: '已发货',
    WAITING_PICKUP: '待自提',
    READY_FOR_PICKUP: '待自提',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    REFUND_PENDING: '待退款审核',
    REFUNDING: '退款中',
    REFUNDED: '已退款'
  };
  return (status && map[status]) || status || '';
}

export function exportOrdersExcel(orders: Order[], fileName = '订单导出.xlsx'): void {
  const header = ['订单号', '商户名称', '下单时间', '商品', '数量', '买家', '手机号', '收货地址', '配送方式', '状态', '实付金额(元)'];
  const rows = orders.map(o => {
    const productSummary = (o.items || []).map(i => `${i.productName || ''}${i.colorName ? ' ' + i.colorName : ''}${i.size ? ' ' + i.size : ''}`).join('；');
    const countSum = (o.items || []).reduce((s, i) => s + (Number(i.count) || 0), 0);
    const addr = o.shippingAddress
      ? `${o.shippingAddress.province || ''}${o.shippingAddress.city || ''}${o.shippingAddress.district || ''}${o.shippingAddress.detail || ''}`
      : '';
    return [
      o.orderNo,
      o.merchantName || '',
      formatDateTime(o.createdAt),
      productSummary,
      countSum,
      o.customerName || '微信买家',
      o.customerPhone || '',
      addr,
      o.deliveryType === 'PICKUP' ? '到店自提' : '极速快递',
      orderStatusText(o.status),
      (Number(o.payAmount || 0) / 100).toFixed(2)
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '订单');
  XLSX.writeFile(wb, fileName);
}
