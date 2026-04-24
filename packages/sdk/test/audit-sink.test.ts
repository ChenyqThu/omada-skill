import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createJsonlAuditSink } from "../src/index.js";
import type { AuditEvent } from "../src/index.js";

function sampleEvent(op: string, status = 200): AuditEvent {
  return {
    ts: "2026-04-23T00:00:00.000Z",
    operationId: op,
    method: "get",
    path: "/v1/test",
    dryRun: false,
    status,
  };
}

/**
 * The sink is fire-and-forget, so tests drain the microtask queue by
 * polling the filesystem a handful of times — beats wiring an internal
 * "last write" promise into production code just to help tests.
 */
async function waitForFile(
  file: string,
  expectBytes = 1,
  tries = 30,
  waitMs = 10,
): Promise<string> {
  for (let i = 0; i < tries; i++) {
    try {
      const contents = await readFile(file, "utf8");
      if (contents.length >= expectBytes) return contents;
    } catch {
      /* not there yet */
    }
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`Timed out waiting for ${file} to have ≥${expectBytes} bytes`);
}

describe("createJsonlAuditSink", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "omada-audit-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appends each event as one JSON line to the dated file", async () => {
    const sink = createJsonlAuditSink({ dir, dateFn: () => "2026-04-23" });
    sink(sampleEvent("listSites", 200));
    sink(sampleEvent("getSiteDetail", 200));
    sink(sampleEvent("listClients", 429));

    const file = join(dir, "2026-04-23.jsonl");
    const raw = await waitForFile(file, 100);
    const lines = raw.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l) as AuditEvent);
    expect(parsed.map((e) => e.operationId)).toEqual(["listSites", "getSiteDetail", "listClients"]);
    expect(parsed[2]?.status).toBe(429);
  });

  it("rotates to a new file when the date changes", async () => {
    let today = "2026-04-23";
    const sink = createJsonlAuditSink({ dir, dateFn: () => today });
    sink(sampleEvent("listSites"));
    await waitForFile(join(dir, "2026-04-23.jsonl"), 1);

    today = "2026-04-24";
    sink(sampleEvent("listClients"));
    await waitForFile(join(dir, "2026-04-24.jsonl"), 1);

    const files = (await readdir(dir)).sort();
    expect(files).toEqual(["2026-04-23.jsonl", "2026-04-24.jsonl"]);
  });

  it("routes write failures through onError instead of throwing", async () => {
    const errors: unknown[] = [];
    // Point at a path whose parent file can't be a directory — appendFile
    // will fail after mkdir succeeds. Easiest way: pre-create a file where
    // the sink wants a directory.
    const badDir = join(dir, "not-a-dir.txt");
    await (await import("node:fs/promises")).writeFile(badDir, "blocker", "utf8");
    const sink = createJsonlAuditSink({
      dir: badDir,
      dateFn: () => "2026-04-23",
      onError: (e) => errors.push(e),
    });
    sink(sampleEvent("listSites"));
    for (let i = 0; i < 50 && errors.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(errors.length).toBeGreaterThan(0);
  });
});
