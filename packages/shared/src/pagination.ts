export interface PageCursor {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  data: T[];
  totalRows?: number | undefined;
}

export interface PaginateOptions {
  startPage?: number;
  pageSize?: number;
  maxPages?: number;
}

export async function* paginate<T>(
  fetcher: (cursor: PageCursor) => Promise<PageResult<T>>,
  opts: PaginateOptions = {},
): AsyncGenerator<T[], void, undefined> {
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? Number.POSITIVE_INFINITY;
  let page = opts.startPage ?? 1;
  let fetched = 0;

  while (page - (opts.startPage ?? 1) < maxPages) {
    const result = await fetcher({ page, pageSize });
    if (result.data.length === 0) return;
    yield result.data;
    fetched += result.data.length;
    if (result.totalRows !== undefined && fetched >= result.totalRows) return;
    page += 1;
  }
}

export async function collect<T>(gen: AsyncGenerator<T[], void, undefined>): Promise<T[]> {
  const all: T[] = [];
  for await (const batch of gen) all.push(...batch);
  return all;
}
