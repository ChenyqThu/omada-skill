import { describe, expect, it } from "vitest";

import { Logger, type LogEntry } from "../src/logger.js";

function captureSink(): { sink: (entry: LogEntry) => void; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    sink: (entry) => entries.push(entry),
    entries,
  };
}

describe("Logger redaction", () => {
  it("redacts sensitive keys from extra by default", () => {
    const { sink, entries } = captureSink();
    const logger = new Logger("test", "debug", sink);
    logger.info("request", {
      headers: { authorization: "Bearer leak-me", accept: "application/json" },
      password: "hunter2",
    });

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.headers).toEqual({ authorization: "[REDACTED]", accept: "application/json" });
    expect(entry["password"]).toBe("[REDACTED]");
  });

  it("redacts sensitive keys from bindings carried via child()", () => {
    const { sink, entries } = captureSink();
    const parent = new Logger("test", "debug", sink, { token: "sekret" });
    const child = parent.child("sub");
    child.info("event");

    expect(entries[0]?.["token"]).toBe("[REDACTED]");
    expect(entries[0]?.logger).toBe("test.sub");
  });

  it("passes through entries unchanged when redactor is null", () => {
    const { sink, entries } = captureSink();
    const logger = new Logger("test", "debug", sink, {}, null);
    logger.info("request", { authorization: "Bearer dev-only" });
    expect(entries[0]?.["authorization"]).toBe("Bearer dev-only");
  });
});
