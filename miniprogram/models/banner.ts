/**
 * 营销 Banner 模型定义
 */

export interface BannerItem {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  targetUrl: string;
  badge?: string;
}
