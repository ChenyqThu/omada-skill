import { describe, expect, it } from "vitest";

import { collect, paginate, type PageCursor, type PageResult } from "../src/pagination.js";

function makeFetcher<T>(
  pages: Array<PageResult<T>>,
): [fetcher: (c: PageCursor) => Promise<PageResult<T>>, calls: PageCursor[]] {
  const calls: PageCursor[] = [];
  const fetcher = async (cursor: PageCursor): Promise<PageResult<T>> => {
    calls.push(cursor);
    return pages[cursor.page - 1] ?? { data: [] };
  };
  return [fetcher, calls];
}

describe("paginate", () => {
  it("walks every page until totalRows is satisfied", async () => {
    const [fetcher, calls] = makeFetcher([
      { data: [1, 2], totalRows: 5 },
      { data: [3, 4], totalRows: 5 },
      { data: [5], totalRows: 5 },
    ]);
    const all = await collect(paginate(fetcher, { pageSize: 2 }));
    expect(all).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toEqual([
      { page: 1, pageSize: 2 },
      { page: 2, pageSize: 2 },
      { page: 3, pageSize: 2 },
    ]);
  });

  it("stops when data is empty even without totalRows", async () => {
    const [fetcher, calls] = makeFetcher<number>([{ data: [1, 2] }, { data: [3] }, { data: [] }]);
    const all = await collect(paginate(fetcher, { pageSize: 2 }));
    expect(all).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(3);
  });

  it("respects maxPages even when pages keep flowing", async () => {
    const [fetcher, calls] = makeFetcher([
      { data: [1] },
      { data: [2] },
      { data: [3] },
      { data: [4] },
    ]);
    const all = await collect(paginate(fetcher, { pageSize: 1, maxPages: 2 }));
    expect(all).toEqual([1, 2]);
    expect(calls).toHaveLength(2);
  });

  it("honours startPage so callers can resume mid-stream", async () => {
    const [fetcher, calls] = makeFetcher([
      { data: [1] },
      { data: [2] },
      { data: [3] },
      { data: [] },
    ]);
    const all = await collect(paginate(fetcher, { pageSize: 1, startPage: 2 }));
    expect(all).toEqual([2, 3]);
    expect(calls.map((c) => c.page)).toEqual([2, 3, 4]);
  });

  it("uses pageSize=100 by default when not specified", async () => {
    let observedSize = -1;
    const fetcher = async (c: PageCursor): Promise<PageResult<number>> => {
      observedSize = c.pageSize;
      return { data: [] };
    };
    await collect(paginate(fetcher));
    expect(observedSize).toBe(100);
  });
});
