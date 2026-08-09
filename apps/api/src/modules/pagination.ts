export interface PaginationInput {
  page: number;
  perPage: number;
  skip: number;
  take: number;
}

const MAX_PER_PAGE = 1000;
const DEFAULT_PER_PAGE = 1000;

export function parsePagination(query: Record<string, unknown>): PaginationInput {
  const parsedPage = Number.parseInt(String(query.page ?? ""), 10);
  const parsedPerPage = Number.parseInt(String(query.perPage ?? ""), 10);

  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const perPage =
    Number.isFinite(parsedPerPage) && parsedPerPage > 0 ? Math.min(parsedPerPage, MAX_PER_PAGE) : DEFAULT_PER_PAGE;

  return {
    page,
    perPage,
    skip: (page - 1) * perPage,
    take: perPage
  };
}

export function buildPaginationMeta(total: number, page: number, perPage: number) {
  return {
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage))
  };
}
