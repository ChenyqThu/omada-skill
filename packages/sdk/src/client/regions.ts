// Known Omada Cloud (Northbound) regional endpoints.
//
// The canonical spec only ships one base URL (use1). Additional regions are
// declared here so the Omada operations team can extend this map without
// touching the runtime client.
export const REGIONS = {
  use1: "https://use1-omada-northbound.tplinkcloud.com",
} as const satisfies Record<string, string>;

export type RegionKey = keyof typeof REGIONS;

export function isKnownRegion(key: string): key is RegionKey {
  return Object.prototype.hasOwnProperty.call(REGIONS, key);
}

export interface ResolveBaseUrlOptions {
  region?: string;
  baseUrl?: string;
}

export function resolveBaseUrl(opts: ResolveBaseUrlOptions): string {
  if (opts.baseUrl) return stripTrailingSlash(opts.baseUrl);
  const key = opts.region ?? "use1";
  if (!isKnownRegion(key)) {
    throw new Error(
      `Unknown Omada region "${key}". Known regions: ${Object.keys(REGIONS).join(", ")}. ` +
        `Pass { baseUrl: "https://..." } to use an unlisted controller.`,
    );
  }
  return stripTrailingSlash(REGIONS[key]);
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
