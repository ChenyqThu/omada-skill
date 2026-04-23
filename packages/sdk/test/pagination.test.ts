import { describe, expect, it } from "vitest";

import { collect } from "@omada/shared";

import {
  MockAuth,
  MockTransport,
  OmadaClient,
  callPaginated,
  operations,
  type OperationId,
} from "../src/index.js";

function pickReadOperation(): { opId: OperationId; pathParams: Record<string, string> } {
  for (const op of Object.values(operations)) {
    if (op.method !== "get") continue;
    const placeholders = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
    if (placeholders.length === 0) continue;
    const pathParams: Record<string, string> = {};
    for (const name of placeholders) pathParams[name] = `fixture-${name}`;
    return { opId: op.operationId as OperationId, pathParams };
  }
  throw new Error("generated operations had no parameterised GET — spec shape changed?");
}

interface Site {
  siteId: string;
  name: string;
}

const SITES: Site[] = [
  { siteId: "site-1", name: "HQ" },
  { siteId: "site-2", name: "Brooklyn" },
  { siteId: "site-3", name: "Portland" },
  { siteId: "site-4", name: "Austin" },
  { siteId: "site-5", name: "Seattle" },
  { siteId: "site-6", name: "Denver" },
];

describe("callPaginated", () => {
  it("iterates all pages and accumulates every row via totalRows terminator", async () => {
    const { opId, pathParams } = pickReadOperation();
    const transport = new MockTransport().pagedRoute<Site>({
      urlMatch: "fixture-",
      items: SITES,
      pageSize: 2,
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const all = await collect(
      callPaginated<Site>(client, opId, { path: pathParams }, { pageSize: 2 }),
    );
    expect(all.map((s) => s.siteId)).toEqual([
      "site-1",
      "site-2",
      "site-3",
      "site-4",
      "site-5",
      "site-6",
    ]);
    expect(transport.calls).toHaveLength(3);
    expect(transport.calls[0]!.url).toContain("page=1");
    expect(transport.calls[1]!.url).toContain("page=2");
    expect(transport.calls[2]!.url).toContain("page=3");
  });

  it("stops at maxPages even when more rows remain on the server", async () => {
    const { opId, pathParams } = pickReadOperation();
    const transport = new MockTransport().pagedRoute<Site>({
      urlMatch: "fixture-",
      items: SITES,
      pageSize: 2,
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const collected: Site[] = [];
    for await (const batch of callPaginated<Site>(
      client,
      opId,
      { path: pathParams },
      { pageSize: 2, maxPages: 2 },
    )) {
      collected.push(...batch);
    }
    expect(collected).toHaveLength(4);
    expect(transport.calls).toHaveLength(2);
  });

  it("terminates on the first empty page when the endpoint omits totalRows", async () => {
    const { opId, pathParams } = pickReadOperation();
    const transport = new MockTransport().pagedRoute<Site>({
      urlMatch: "fixture-",
      items: SITES.slice(0, 3),
      pageSize: 2,
      omitTotalRows: true,
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    const all = await collect(
      callPaginated<Site>(client, opId, { path: pathParams }, { pageSize: 2 }),
    );
    expect(all).toHaveLength(3);
    // 2 non-empty pages + 1 empty page to trigger termination.
    expect(transport.calls).toHaveLength(3);
    expect(transport.calls[2]!.url).toContain("page=3");
  });

  it("forwards unrelated query params on every page", async () => {
    const { opId, pathParams } = pickReadOperation();
    const transport = new MockTransport().pagedRoute<Site>({
      urlMatch: "fixture-",
      items: SITES,
      pageSize: 3,
    });
    const client = new OmadaClient({ auth: new MockAuth(), transport });

    await collect(
      callPaginated<Site>(
        client,
        opId,
        { path: pathParams, query: { searchKey: "HQ" } },
        { pageSize: 3 },
      ),
    );
    for (const call of transport.calls) {
      expect(call.url).toContain("searchKey=HQ");
    }
  });
});
