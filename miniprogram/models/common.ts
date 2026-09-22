/**
 * 通用响应与分页模型定义
 */

export interface ApiResponse<T> {
  code?: number | string;
  success?: boolean;
  message?: string;
  data: T;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedList<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
