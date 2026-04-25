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
  /** Replacement emitted when a cycle is detected. Defaults to `"[Circular]"`. */
  cyclePlaceholder?: string;
}

export function redact<T>(value: T, opts: RedactOptions = {}): T {
  const placeholder = opts.placeholder ?? "[REDACTED]";
  const cyclePlaceholder = opts.cyclePlaceholder ?? "[Circular]";
  const lowered = new Set((opts.keys ?? DEFAULT_SENSITIVE_KEYS).map((k) => k.toLowerCase()));
  const seen = new WeakSet<object>();
  return walk(value, lowered, placeholder, cyclePlaceholder, seen) as T;
}

function walk(
  node: unknown,
  keys: Set<string>,
  placeholder: string,
  cyclePlaceholder: string,
  seen: WeakSet<object>,
): unknown {
  if (node === null || typeof node !== "object") return node;
  // Guard against cycles — an attacker (or a careless caller) could otherwise
  // make redact() recurse forever and blow the stack.
  if (seen.has(node as object)) return cyclePlaceholder;
  seen.add(node as object);
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, keys, placeholder, cyclePlaceholder, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = keys.has(k.toLowerCase())
      ? placeholder
      : walk(v, keys, placeholder, cyclePlaceholder, seen);
  }
  return out;
}
