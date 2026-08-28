/** 统一分页工具：解析查询参数并产出 Prisma 的 skip/take，以及规范化的分页响应。 */

export interface PageQuery {
  page?: string | number;
  pageSize?: string | number;
}

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** 解析并夹紧分页参数（页号 ≥1，每页 1~100，默认 20）。 */
export function parsePage(query: PageQuery): PageParams {
  const rawPage = typeof query.page === 'string' ? parseInt(query.page, 10) : query.page;
  const rawSize =
    typeof query.pageSize === 'string' ? parseInt(query.pageSize, 10) : query.pageSize;
  const page = Math.max(1, rawPage && !isNaN(rawPage) ? rawPage : 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, rawSize && !isNaN(rawSize) ? rawSize : DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** 组装分页响应。 */
export function toPaged<T>(items: T[], total: number, params: PageParams): Paged<T> {
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
