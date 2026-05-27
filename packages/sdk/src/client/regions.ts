// Known Omada Cloud (Northbound) regional endpoints.
//
// The canonical spec only ships one base URL (use1). Additional regions are
// declared here so the Omada operations team can extend this map without
// touching the runtime client. Region keys match the host prefix used by
// the controller dashboard (Settings > Platform Integration > Open API).
export const REGIONS = {
  // US East (default — canonical spec)
  use1: "https://use1-omada-northbound.tplinkcloud.com",
  // Europe West
  euw1: "https://euw1-omada-northbound.tplinkcloud.com",
  // Asia Pacific Singapore
  aps1: "https://aps1-omada-northbound.tplinkcloud.com",
} as const satisfies Record<string, string>;

export type RegionKey = keyof typeof REGIONS;

export function isKnownRegion(key: string): key is RegionKey {
  return Object.prototype.hasOwnProperty.call(REGIONS, key);
}

export interface ResolveBaseUrlOptions {
  region?: string;
  baseUrl?: string;
  /**
   * When true, allows `http://` schemes pointing at loopback hosts. Defaults to
   * false. Exists only for local development and tests that exercise the
   * transport against a localhost mock — real controller URLs must be HTTPS.
   */
  allowInsecureLoopback?: boolean;
}

export function resolveBaseUrl(opts: ResolveBaseUrlOptions): string {
  if (opts.baseUrl) return stripTrailingSlash(assertSecureUrl(opts.baseUrl, opts));
  const key = opts.region ?? "use1";
  if (!isKnownRegion(key)) {
    throw new Error(
      `Unknown Omada region "${key}". Known regions: ${Object.keys(REGIONS).join(", ")}. ` +
        `Pass { baseUrl: "https://..." } to use an unlisted controller.`,
    );
  }
  return stripTrailingSlash(REGIONS[key]);
}

/**
 * Rejects URLs that would leak client credentials in plaintext. Accepts
 * `https:` anywhere, and `http:` only on loopback hosts (127.0.0.1, ::1,
 * localhost) when `allowInsecureLoopback` is set.
 */
export function assertSecureUrl(
  raw: string,
  opts: { allowInsecureLoopback?: boolean } = {},
): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${JSON.stringify(raw)}`);
  }
  if (parsed.protocol === "https:") return raw;
  if (
    parsed.protocol === "http:" &&
    opts.allowInsecureLoopback &&
    isLoopbackHost(parsed.hostname)
  ) {
    return raw;
  }
  throw new Error(
    `Refusing insecure URL ${JSON.stringify(raw)}: only https:// is allowed ` +
      `(http:// is permitted for loopback hosts only when allowInsecureLoopback is set).`,
  );
}

function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return true;
  }
  // IPv4 loopback range 127.0.0.0/8
  return /^127(?:\.\d{1,3}){3}$/.test(host);
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
