import { appendFile, mkdir, rename, stat } from "node:fs/promises";
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
   * Called when an append fails. Required: audit events cover high-risk
   * operations (deleteSite, factoryReset), and losing them silently defeats
   * the guardrail. Operators MUST wire this to their structured logger.
   */
  onError: (err: unknown) => void;
  /**
   * Rotate the active file when it exceeds this many bytes. The active file is
   * renamed to `YYYY-MM-DD.N.jsonl` (N = next free suffix) and a fresh file is
   * started. Defaults to `undefined` (size-based rotation disabled; daily
   * rotation via `dateFn` still applies).
   */
  maxBytes?: number;
}

/**
 * Sink returned by `createJsonlAuditSink`. Still callable as a plain
 * `AuditSink`; exposes `flush()` so callers can drain queued writes on
 * shutdown (SIGTERM / test teardown).
 */
export interface JsonlAuditSink extends AuditSink {
  /** Await completion of all queued writes. Safe to call repeatedly. */
  flush(): Promise<void>;
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
 * Writes are serialized through a promise tail so events captured in rapid
 * succession land in order. The tail is reset after each drain to avoid an
 * ever-growing microtask chain in long-running servers.
 *
 * Single-process only; no inter-process file locking. Events are already
 * redacted by the client before arrival.
 */
export function createJsonlAuditSink(opts: JsonlAuditSinkOptions): JsonlAuditSink {
  const dateFn = opts.dateFn ?? defaultDateFn;
  const { onError, maxBytes } = opts;
  let dirEnsured = false;
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;

  const drain = async (event: AuditEvent): Promise<void> => {
    const line = `${JSON.stringify(event)}\n`;
    const file = join(opts.dir, `${dateFn()}.jsonl`);
    try {
      if (!dirEnsured) {
        await mkdir(opts.dir, { recursive: true });
        dirEnsured = true;
      }
      if (maxBytes !== undefined) {
        await rotateIfOversized(opts.dir, file, maxBytes);
      }
      await appendFile(file, line, "utf8");
    } catch (err) {
      onError(err);
    }
  };

  const sink = ((event: AuditEvent): void => {
    pending += 1;
    tail = tail
      .then(() => drain(event))
      .finally(() => {
        pending -= 1;
        // Reset the chain when drained so we never accumulate an unbounded
        // settled-promise history over the process lifetime.
        if (pending === 0) tail = Promise.resolve();
      });
  }) as JsonlAuditSink;

  sink.flush = async () => {
    while (pending > 0) {
      const snapshot = tail;
      await snapshot;
    }
  };

  return sink;
}

async function rotateIfOversized(dir: string, file: string, maxBytes: number): Promise<void> {
  let size: number;
  try {
    const info = await stat(file);
    size = info.size;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw err;
  }
  if (size < maxBytes) return;
  // Find the next free rotation suffix. Bounded by `maxBytes` so the cost
  // here is minor unless the caller is producing millions of files per day.
  for (let i = 1; i < 1000; i += 1) {
    const rotated = file.replace(/\.jsonl$/, `.${i}.jsonl`);
    try {
      await stat(rotated);
      continue;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
      await rename(file, rotated);
      return;
    }
  }
  // Give up rotating; append keeps working but the file will continue growing.
  // Operators hitting this cap have a bigger problem we shouldn't hide.
  throw new Error(`unable to find a free rotation suffix for ${file} in ${dir}`);
}
