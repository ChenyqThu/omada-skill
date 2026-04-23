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

export const defaultSink: LogSink = (entry) => {
  process.stderr.write(`${JSON.stringify(entry)}\n`);
};

export class Logger {
  private readonly minLevel: number;

  constructor(
    private readonly name: string,
    private readonly level: LogLevel = "info",
    private readonly sink: LogSink = defaultSink,
    private readonly bindings: Record<string, unknown> = {},
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
    return new Logger(`${this.name}.${suffix}`, this.level, this.sink, {
      ...this.bindings,
      ...bindings,
    });
  }

  private emit(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
    if (LEVELS[level] < this.minLevel) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      logger: this.name,
      ...this.bindings,
      ...extra,
    };
    this.sink(entry);
  }
}

export const rootLogger = new Logger("omada");
