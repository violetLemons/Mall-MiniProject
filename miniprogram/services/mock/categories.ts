import { ProductCategory } from '../../models/product';

export const MOCK_CATEGORIES: ProductCategory[] = [
  {
    id: 'c1',
    name: '数码',
    icon: '💻',
    badge: '热门'
  },
  {
    id: 'c2',
    name: '服饰',
    icon: '👕'
  },
  {
    id: 'c3',
    name: '家居',
    icon: '🏠',
    badge: '实用'
  },
  {
    id: 'c4',
    name: '美妆',
    icon: '💄',
    badge: '热销'
  },
  {
    id: 'c5',
    name: '新品',
    icon: '✨',
    badge: 'NEW'
  },
  {
    id: 'c6',
    name: '精选',
    icon: '⭐',
    badge: '精选'
  }
];
