import { paginate, type PaginateOptions } from "@omada/shared";

import type { OperationId } from "../generated/operations.js";
import type { OmadaClient } from "./OmadaClient.js";
import type { CallParams } from "./types.js";

/**
 * Shape of a paged Omada response (`result` envelope).
 *
 * Every paged endpoint in the Open API returns
 * `{ errorCode, msg, result: { data: T[], totalRows?, currentPage? } }`.
 * `callPaginated` reads `result.data` + `result.totalRows`, both optional —
 * endpoints with a single un-paginated result are tolerated and yield once.
 */
export interface OmadaPagedEnvelope<T> {
  errorCode?: number;
  msg?: string;
  result?: {
    data?: T[];
    totalRows?: number;
    currentPage?: number;
    currentSize?: number;
    currentPageSize?: number;
  };
}

/**
 * Async iterator over all pages of a paginated read operation.
 *
 * Pages are requested lazily — consumers can `break` at any time.
 * Pagination terminates when the server returns fewer rows than `totalRows`
 * implies, when `data` comes back empty, or when `maxPages` is reached.
 *
 *     for await (const batch of callPaginated<Site>(client, "getSiteList", {
 *       path: { omadacId },
 *     })) {
 *       for (const site of batch) processSite(site);
 *     }
 *
 * Query params passed in `baseParams.query` are forwarded on every page;
 * `page` and `pageSize` are injected by this helper and will overwrite any
 * values the caller tries to set via `baseParams.query`.
 */
export async function* callPaginated<T = unknown>(
  client: OmadaClient,
  operationId: OperationId,
  baseParams: CallParams = {},
  opts: PaginateOptions = {},
): AsyncGenerator<T[], void, undefined> {
  yield* paginate<T>(async ({ page, pageSize }) => {
    const params: CallParams = {
      ...baseParams,
      query: {
        ...baseParams.query,
        page,
        pageSize,
      },
    };
    const raw = (await client.call(operationId, params)) as OmadaPagedEnvelope<T>;
    const data = raw.result?.data ?? [];
    const totalRows = raw.result?.totalRows;
    return totalRows !== undefined ? { data, totalRows } : { data };
  }, opts);
}
