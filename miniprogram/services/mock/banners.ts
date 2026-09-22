import { BannerItem } from '../../models/banner';

export const MOCK_BANNERS: BannerItem[] = [
  {
    id: 'b1',
    title: '开学季 · 全场好物狂欢',
    subtitle: '认证学生立减100元 / 领券满减',
    imageUrl: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=1200&auto=format&fit=crop&q=80',
    targetUrl: '/pages/goods/list/index?categoryId=c5',
    badge: '开学季特惠'
  },
  {
    id: 'b2',
    title: 'NEW ARRIVAL · 2026春夏首发',
    subtitle: '先锋潮流新品重塑日常穿搭',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1200&auto=format&fit=crop&q=80',
    targetUrl: '/pages/goods/detail/index?id=p1',
    badge: '新品首发'
  },
  {
    id: 'b3',
    title: '居家必备 · 品质生活好物精选',
    subtitle: '实用耐用好物，提升日常幸福感',
    imageUrl: 'https://images.unsplash.com/photo-1512374382149-233c42b6a83b?w=1200&auto=format&fit=crop&q=80',
    targetUrl: '/pages/goods/list/index?categoryId=c3',
    badge: '品质精选'
  },
  {
    id: 'b4',
    title: '限时闪购 · 经典百搭单品',
    subtitle: '限时特价低至5折起',
    imageUrl: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=1200&auto=format&fit=crop&q=80',
    targetUrl: '/pages/goods/list/index?categoryId=c6',
    badge: '限时特价'
  }
];
