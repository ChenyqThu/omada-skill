export const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
  "authorization",
  "password",
  "secret",
  "token",
  "client_secret",
  "clientSecret",
  "access_token",
  "accessToken",
  "refresh_token",
  "refreshToken",
  "api_key",
  "apiKey",
  "set-cookie",
  "cookie",
];

export interface RedactOptions {
  keys?: readonly string[];
  placeholder?: string;
}

export function redact<T>(value: T, opts: RedactOptions = {}): T {
  const placeholder = opts.placeholder ?? "[REDACTED]";
  const lowered = new Set((opts.keys ?? DEFAULT_SENSITIVE_KEYS).map((k) => k.toLowerCase()));
  return walk(value, lowered, placeholder) as T;
}

function walk(node: unknown, keys: Set<string>, placeholder: string): unknown {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((item) => walk(item, keys, placeholder));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = keys.has(k.toLowerCase()) ? placeholder : walk(v, keys, placeholder);
  }
  return out;
}
