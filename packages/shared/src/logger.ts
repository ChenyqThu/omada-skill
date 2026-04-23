import { redact } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  logger: string;
  [key: string]: unknown;
}

export type LogSink = (entry: LogEntry) => void;

/** Post-processor applied to each entry just before it hits the sink. */
export type LogRedactor = (entry: LogEntry) => LogEntry;

export const defaultSink: LogSink = (entry) => {
  process.stderr.write(`${JSON.stringify(entry)}\n`);
};

/** Default redactor: deep-redacts sensitive keys listed in `redact.ts`. */
export const defaultRedactor: LogRedactor = (entry) => redact(entry);

/**
 * Read-once escape hatch for local debugging — set `OMADA_LOG_NO_REDACT=1`
 * before importing this module to disable redaction on `rootLogger`.
 * Library-level `Logger` instances constructed directly can still pass
 * `null` to opt out explicitly.
 */
function pickRootRedactor(): LogRedactor | null {
  return process.env["OMADA_LOG_NO_REDACT"] === "1" ? null : defaultRedactor;
}

export class Logger {
  private readonly minLevel: number;

  constructor(
    private readonly name: string,
    private readonly level: LogLevel = "info",
    private readonly sink: LogSink = defaultSink,
    private readonly bindings: Record<string, unknown> = {},
    private readonly redactor: LogRedactor | null = defaultRedactor,
  ) {
    this.minLevel = LEVELS[level];
  }

  debug(msg: string, extra?: Record<string, unknown>): void {
    this.emit("debug", msg, extra);
  }
  info(msg: string, extra?: Record<string, unknown>): void {
    this.emit("info", msg, extra);
  }
  warn(msg: string, extra?: Record<string, unknown>): void {
    this.emit("warn", msg, extra);
  }
  error(msg: string, extra?: Record<string, unknown>): void {
    this.emit("error", msg, extra);
  }

  child(suffix: string, bindings?: Record<string, unknown>): Logger {
    return new Logger(
      `${this.name}.${suffix}`,
      this.level,
      this.sink,
      { ...this.bindings, ...bindings },
      this.redactor,
    );
  }

  private emit(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
    if (LEVELS[level] < this.minLevel) return;
    const raw: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      logger: this.name,
      ...this.bindings,
      ...extra,
    };
    this.sink(this.redactor ? this.redactor(raw) : raw);
  }
}

export const rootLogger = new Logger("omada", "info", defaultSink, {}, pickRootRedactor());
