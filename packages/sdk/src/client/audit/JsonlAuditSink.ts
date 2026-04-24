import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { AuditEvent, AuditSink } from "../types.js";

export interface JsonlAuditSinkOptions {
  /** Directory to write daily files under. Created on first write. */
  dir: string;
  /**
   * Override for date-stamp derivation — returns `YYYY-MM-DD`. Defaults to
   * today's UTC date. Injectable for deterministic tests.
   */
  dateFn?: () => string;
  /**
   * Called when an append fails. Defaults to `console.error` so failures are
   * observable without killing the request path. Replace with a logger in
   * production wiring.
   */
  onError?: (err: unknown) => void;
}

function defaultDateFn(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Creates an AuditSink that appends each event as a JSON line to
 * `${dir}/YYYY-MM-DD.jsonl`. The directory is created on-demand and a new
 * file is started each UTC day (date comes from `dateFn`, which tests can
 * swap to exercise rotation).
 *
 * This sink is fire-and-forget — the returned function is synchronous to
 * match the `AuditSink` contract, but the underlying `fs.appendFile` runs
 * async and errors are routed through `onError`. Single-process only; no
 * file locking. Events are already redacted by the client before arrival.
 */
export function createJsonlAuditSink(opts: JsonlAuditSinkOptions): AuditSink {
  const dateFn = opts.dateFn ?? defaultDateFn;
  const onError = opts.onError ?? ((err: unknown) => console.error("[JsonlAuditSink]", err));
  let dirEnsured = false;
  // Serialize writes by chaining off a tail promise — prevents racing
  // appendFile calls from reordering events captured in rapid succession.
  let tail: Promise<void> = Promise.resolve();

  return (event: AuditEvent): void => {
    const line = `${JSON.stringify(event)}\n`;
    const file = join(opts.dir, `${dateFn()}.jsonl`);
    tail = tail.then(async () => {
      try {
        if (!dirEnsured) {
          await mkdir(opts.dir, { recursive: true });
          dirEnsured = true;
        }
        await appendFile(file, line, "utf8");
      } catch (err) {
        onError(err);
      }
    });
  };
}
