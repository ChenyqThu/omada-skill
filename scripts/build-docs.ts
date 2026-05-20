#!/usr/bin/env tsx
/**
 * Preprocess specs/omada_api.json into the shape the docs site wants:
 *
 *   - inject top-level `tags` (the upstream spec leaves it empty)
 *   - inject `x-tagGroups` — group the 146 operation-level tags into a
 *     dozen business domains so the sidebar is navigable
 *   - inject `components.securitySchemes` + `security` (upstream ships
 *     neither, which would hide the auth scheme from the doc UI)
 *   - light polish on `info`
 *
 * Output lands at apps/docs/apis/omada.json, which zudoku.config.ts mounts
 * via `apis.type: "file"`.
 *
 * Run via `pnpm --filter @omada/docs predev` (or directly: `tsx scripts/build-docs.ts`).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface OpenApiOperation {
  operationId?: string;
  tags?: string[];
}
type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;
interface OpenApiSpec {
  openapi?: string;
  info?: { title?: string; description?: string; version?: string };
  paths?: Record<string, OpenApiPathItem>;
  tags?: Array<{ name: string; description?: string }>;
  components?: { schemas?: Record<string, unknown>; securitySchemes?: Record<string, unknown> };
  security?: Array<Record<string, string[]>>;
  servers?: Array<{ url: string; description?: string }>;
  [k: string]: unknown;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_IN = resolve(REPO_ROOT, "specs/omada_api.json");
const SPEC_OUT = resolve(REPO_ROOT, "apps/docs/apis/omada.json");

// ---------------------------------------------------------------------------
// Tag → business-domain mapping. Anything not listed falls through to "Other".
// Order in DOMAIN_ORDER drives sidebar order.
// ---------------------------------------------------------------------------

const DOMAIN_ORDER = [
  "Sites & Templates",
  "Devices",
  "Wireless",
  "Switching",
  "Routing & Security",
  "VoIP",
  "Identity & Access",
  "Services & Portal",
  "Clients & Insights",
  "Reports & Health",
  "Controller",
  "MSP",
  "Other",
] as const;
type Domain = (typeof DOMAIN_ORDER)[number];

const TAG_DOMAIN: Record<string, Domain> = {
  // Sites & Templates
  Site: "Sites & Templates",
  "Site Configuration": "Sites & Templates",
  "Site Template": "Sites & Templates",
  "Site Template Configuration": "Sites & Templates",
  "Msp setting": "Sites & Templates",

  // Devices
  Device: "Devices",
  Firmware: "Devices",
  Profiles: "Devices",
  "Profiles (Template)": "Devices",
  CertProfiles: "Devices",
  "CertProfiles (Template)": "Devices",
  "Intelli Recover Device": "Devices",
  "OUI Based VLAN": "Devices",
  "OUI Based VLAN (Template)": "Devices",

  // Wireless
  Ap: "Wireless",
  "Wireless Network": "Wireless",
  "Wireless Network (Template)": "Wireless",
  Bluetooth: "Wireless",
  "Bluetooth(Template)": "Wireless",
  "WLAN Optimization": "Wireless",
  "Wireless IDS/IPS": "Wireless",
  "Wireless IDS/IPS (Template)": "Wireless",
  Rrm: "Wireless",

  // Switching (incl. OLT/PON family)
  Switch: "Switching",
  "Switch (Template)": "Switching",
  "Switch QoS": "Switching",
  "Wired Network": "Switching",
  "Wired Network (Template)": "Switching",
  Stack: "Switching",
  Mlag: "Switching",
  Topology: "Switching",
  OLT: "Switching",
  "OLT ONU Register": "Switching",
  "OLT ONU Management": "Switching",
  "OLT DBA": "Switching",
  "OLT Service Port": "Switching",
  "OLT Service Port Profile": "Switching",
  "OLT Service Profile": "Switching",
  "OLT Traffic Profile": "Switching",
  "OLT T-cont": "Switching",
  "OLT Gem Port": "Switching",
  "OLT Gem Mapping": "Switching",
  "OLT Line Profile": "Switching",
  "OLT Pon Port": "Switching",
  "OLT ONT Port": "Switching",

  // Routing & Security
  Gateway: "Routing & Security",
  "Gateway (Template)": "Routing & Security",
  "Gateway QoS": "Routing & Security",
  "Gateway QOS (Template)": "Routing & Security",
  VPN: "Routing & Security",
  "SSL VPN": "Routing & Security",
  "Wireguard VPN": "Routing & Security",
  Routing: "Routing & Security",
  "Routing (Template)": "Routing & Security",
  OSPF: "Routing & Security",
  VRRP: "Routing & Security",
  "SD-WAN": "Routing & Security",
  NAT: "Routing & Security",
  "NAT (Template)": "Routing & Security",
  "Disable Nat": "Routing & Security",
  ACL: "Routing & Security",
  "ACL (Template)": "Routing & Security",
  Firewall: "Routing & Security",
  "Firewall (Template)": "Routing & Security",
  "Global Security": "Routing & Security",
  "Threat Management": "Routing & Security",
  "Attack Defense": "Routing & Security",
  "Attack Defense (Template)": "Routing & Security",
  "IDS/IPS": "Routing & Security",
  "IDS/IPS (Template)": "Routing & Security",
  "IP-MAC Binding": "Routing & Security",
  "IP-MAC Binding (Template)": "Routing & Security",
  "Arp Detection": "Routing & Security",
  "Session Limit": "Routing & Security",
  "Session Limit (Template)": "Routing & Security",
  "MAC Filtering": "Routing & Security",
  "MAC Filtering (Template)": "Routing & Security",
  "Bandwidth Control": "Routing & Security",
  "Bandwidth Control (Template)": "Routing & Security",
  "URL Filtering": "Routing & Security",
  "URL Filtering (Template)": "Routing & Security",
  "Dhcp Snooping": "Routing & Security",
  "Access Control": "Routing & Security",
  "Access Control (Template)": "Routing & Security",
  "Remote Access": "Routing & Security",
  "EoGRE Tunnel": "Routing & Security",

  // VoIP
  VoIP: "VoIP",
  "VoIP (Template)": "VoIP",

  // Identity & Access
  Authentication: "Identity & Access",
  "Authentication (Template)": "Identity & Access",
  "User and Role": "Identity & Access",
  "MSP User and Role": "Identity & Access",
  SSO: "Identity & Access",
  "MSP SSO": "Identity & Access",
  Voucher: "Identity & Access",
  "Form Auth Data": "Identity & Access",
  "Local User": "Identity & Access",
  "Cloud User": "Identity & Access",
  "Authorized Client": "Identity & Access",
  "Hotspot Operators": "Identity & Access",

  // Services & Portal
  Service: "Services & Portal",
  "Service (Template)": "Services & Portal",
  "Application Control": "Services & Portal",
  Portal: "Services & Portal",
  "Lan Multicast": "Services & Portal",
  "Lan Multicast (Template)": "Services & Portal",
  Schedule: "Services & Portal",
  "Schedule (Template)": "Services & Portal",

  // Clients & Insights
  Client: "Clients & Insights",
  "Client Insight": "Clients & Insights",
  Insight: "Clients & Insights",
  "Intelli Recover Client": "Clients & Insights",

  // Reports & Health
  Dashboard: "Reports & Health",
  "Global Dashboard Overview": "Reports & Health",
  Health: "Reports & Health",
  Log: "Reports & Health",
  "Log (Template)": "Reports & Health",
  "Msp Log": "Reports & Health",
  "Audit Log": "Reports & Health",
  "Audit Log (Template)": "Reports & Health",
  "Report v2": "Reports & Health",
  "Network Report": "Reports & Health",
  "Network Analyze": "Reports & Health",
  Statistic: "Reports & Health",
  "History Data Retention": "Reports & Health",
  "MSP History Data Retention": "Reports & Health",
  "Abnormal Detect": "Reports & Health",
  "Webhook Setting": "Reports & Health",
  "Msp Webhook Setting": "Reports & Health",

  // Controller
  "Controller Settings": "Controller",
  "System Settings": "Controller",
  "Device Management Setting": "Controller",
  License: "Controller",
  CLI: "Controller",
  "CLI (Template)": "Controller",
  SIM: "Controller",
  "SIM (Template)": "Controller",
  "Backup and Restore": "Controller",
  Cluster: "Controller",
  "Data Export": "Controller",
  "Quick Action": "Controller",
  "Batch OpenAPI": "Controller",

  // MSP — Managed Service Provider surface
  Customer: "MSP",
  "MSP Device": "MSP",
  "MSP Site": "MSP",
  "Msp License": "MSP",
  "MSP Batch OpenAPI": "MSP",
};

// ---------------------------------------------------------------------------

function main(): void {
  const raw = readFileSync(SPEC_IN, "utf-8");
  const spec = JSON.parse(raw) as OpenApiSpec;

  // 1. Tally tag usage across operations.
  const tagUsage = new Map<string, number>();
  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      for (const tag of op.tags ?? []) {
        tagUsage.set(tag, (tagUsage.get(tag) ?? 0) + 1);
      }
    }
  }

  // 2. Build top-level `tags` (upstream leaves it empty).
  spec.tags = [...tagUsage.keys()]
    .sort()
    .map((name) => ({ name, description: `${tagUsage.get(name)} operations` }));

  // 3. Build x-tagGroups by bucketing into business domains.
  const buckets = new Map<Domain, string[]>();
  const unmapped: string[] = [];
  for (const tag of tagUsage.keys()) {
    const domain = TAG_DOMAIN[tag] ?? "Other";
    if (domain === "Other") unmapped.push(tag);
    if (!buckets.has(domain)) buckets.set(domain, []);
    buckets.get(domain)!.push(tag);
  }
  const tagGroups = DOMAIN_ORDER.flatMap((name) => {
    const tags = buckets.get(name);
    if (!tags || tags.length === 0) return [];
    return [{ name, tags: tags.sort() }];
  });
  spec["x-tagGroups"] = tagGroups;

  // 4. Inject security scheme — upstream ships without it.
  spec.components = spec.components ?? {};
  spec.components.securitySchemes = {
    OmadaOAuth: {
      type: "oauth2",
      description:
        "OAuth 2.0. Default flow is client_credentials (server-to-server). " +
        "For agent-with-user, see the Authorization Code flow; for TP-Link " +
        "workload identity, see CIMD. Credentials are obtained from the " +
        "controller at Settings → Open API.",
      flows: {
        clientCredentials: {
          tokenUrl: "https://{controller}/openapi/authorize/token",
          scopes: {},
        },
      },
    },
  };
  spec.security = [{ OmadaOAuth: [] }];

  // 5. Polish info.
  spec.info = {
    ...spec.info,
    title: spec.info?.title ?? "Omada Open API",
    description:
      "Programmatic access to the TP-Link Omada Controller. " +
      "Code samples shown as `TypeScript · @omada/sdk` use the typed client " +
      "shipped in this repository; other languages fall back to the generic " +
      "HTTP envelope.",
  };

  // 6. Write.
  mkdirSync(dirname(SPEC_OUT), { recursive: true });
  writeFileSync(SPEC_OUT, JSON.stringify(spec, null, 2));

  // 7. Report.
  const totalOps = [...tagUsage.values()].reduce((a, b) => a + b, 0);
  console.log("docs preprocess complete");
  console.log(`  in     ${SPEC_IN}`);
  console.log(`  out    ${SPEC_OUT}`);
  console.log(`  ops    ${totalOps}`);
  console.log(`  tags   ${tagUsage.size}`);
  console.log(`  groups ${tagGroups.length}`);
  for (const g of tagGroups) {
    const ops = g.tags.reduce((s, t) => s + (tagUsage.get(t) ?? 0), 0);
    console.log(
      `    ${g.name.padEnd(22)} ${String(g.tags.length).padStart(3)} tags / ${String(ops).padStart(4)} ops`,
    );
  }
  if (unmapped.length) {
    console.log("  unmapped tags (→ Other):");
    for (const t of unmapped.sort((a, b) => (tagUsage.get(b) ?? 0) - (tagUsage.get(a) ?? 0))) {
      console.log(`    ${String(tagUsage.get(t)).padStart(4)} ${t}`);
    }
  }
}

main();
