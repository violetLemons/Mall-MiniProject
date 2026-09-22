/**
 * 金额整型“分”与“元”统一转换与格式化工具
 * 严格遵从支付生产安全规范：所有 API 与底层存储为整数分，仅在 UI 展示和输入边界转换
 */

export function formatCents(amountInCents: number | undefined | null): string {
  if (amountInCents === undefined || amountInCents === null || isNaN(amountInCents)) {
    return '¥0.00';
  }
  const yuan = Number(amountInCents) / 100;
  return `¥${yuan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function centsToYuan(amountInCents: number | undefined | null): number {
  if (amountInCents === undefined || amountInCents === null || isNaN(amountInCents)) {
    return 0;
  }
  return Number((Number(amountInCents) / 100).toFixed(2));
}

export function yuanToCents(amountInYuan: number | string | undefined | null): number {
  if (amountInYuan === undefined || amountInYuan === null) return 0;
  const num = typeof amountInYuan === 'string' ? parseFloat(amountInYuan) : amountInYuan;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
