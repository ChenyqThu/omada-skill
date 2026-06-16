#!/usr/bin/env tsx
/**
 * Fetch the live Omada Open API spec from the cloud northbound
 * `/v3/api-docs` endpoint and write it to `specs/omada_api.json` — the
 * single source of truth the SDK and docs are generated from.
 *
 *   pnpm spec:fetch                              # use1, group "00 All"
 *   pnpm spec:fetch --region euw1                # other cloud region
 *   pnpm spec:fetch --group "03 Device"          # a single springdoc group
 *   pnpm spec:fetch --base-url https://host:8043 # self-hosted controller
 *   pnpm spec:fetch --out specs/scratch.json     # write elsewhere (no overwrite)
 *
 * The endpoint serves MINIFIED JSON; we re-serialize with 2-space
 * indentation so `git diff specs/omada_api.json` stays reviewable. We do
 * NOT hand-edit: springdoc ships no `components.securitySchemes`, and that
 * gap is injected downstream in scripts/build-docs.ts, not here.
 *
 * Discover the full group list at `<base>/v3/api-docs/swagger-config`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

// Known Omada Cloud (northbound) regions. Extend as TP-Link adds data centers.
const KNOWN_REGIONS = ["use1", "euw1", "aps1", "apne1", "sa1"] as const;

interface Args {
  region: string;
  group: string;
  baseUrl: string | null;
  out: string;
}

interface OpenAPISpec {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, { operationId?: string }>>;
}

function parseArgs(argv: string[], repoRoot: string): Args {
  const out: Args = {
    region: "use1",
    group: "00 All",
    baseUrl: null,
    out: resolve(repoRoot, "specs/omada_api.json"),
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--region") out.region = requireValue(args, (i += 1), "--region");
    else if (a === "--group") out.group = requireValue(args, (i += 1), "--group");
    else if (a === "--base-url") out.baseUrl = requireValue(args, (i += 1), "--base-url");
    else if (a === "--out") out.out = resolve(repoRoot, requireValue(args, (i += 1), "--out"));
    else {
      console.error(`[spec-fetch] unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function requireValue(args: string[], i: number, flag: string): string {
  const v = args[i];
  if (!v) {
    console.error(`[spec-fetch] ${flag} requires a value`);
    process.exit(2);
  }
  return v;
}

function baseFor(args: Args): string {
  if (args.baseUrl) return args.baseUrl.replace(/\/+$/, "");
  if (!(KNOWN_REGIONS as readonly string[]).includes(args.region)) {
    console.error(
      `[spec-fetch] unknown region "${args.region}". Known: ${KNOWN_REGIONS.join(", ")}. ` +
        `Use --base-url for an unlisted controller.`,
    );
    process.exit(2);
  }
  return `https://${args.region}-omada-northbound.tplinkcloud.com`;
}

function countOps(spec: OpenAPISpec): number {
  let n = 0;
  for (const item of Object.values(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      if (item[method]?.operationId) n += 1;
    }
  }
  return n;
}

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = parseArgs(process.argv, repoRoot);
  const url = `${baseFor(args)}/v3/api-docs/${encodeURIComponent(args.group)}`;

  console.log(`[spec-fetch] GET ${url}`);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    console.error(`[spec-fetch] HTTP ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const text = await res.text();
  let spec: OpenAPISpec;
  try {
    spec = JSON.parse(text) as OpenAPISpec;
  } catch (err) {
    console.error(`[spec-fetch] response is not valid JSON: ${(err as Error).message}`);
    process.exit(1);
  }
  if (!spec.openapi || !spec.paths) {
    console.error(`[spec-fetch] response is not an OpenAPI document (no openapi/paths)`);
    process.exit(1);
  }

  const newOps = countOps(spec);
  // Sanity guard (SOP §3): a sharp drop in op count usually means a broken
  // upstream payload — refuse to clobber the source of truth silently.
  if (existsSync(args.out)) {
    const prev = JSON.parse(readFileSync(args.out, "utf8")) as OpenAPISpec;
    const prevOps = countOps(prev);
    const delta = newOps - prevOps;
    console.log(
      `[spec-fetch] operations: ${prevOps} → ${newOps} (${delta >= 0 ? "+" : ""}${delta})`,
    );
    if (newOps < prevOps * 0.9) {
      console.error(
        `[spec-fetch] refusing to write: op count dropped >10% (${prevOps} → ${newOps}). ` +
          `If this is intentional, write to --out and inspect first.`,
      );
      process.exit(1);
    }
  } else {
    console.log(`[spec-fetch] operations: ${newOps}`);
  }

  // Re-serialize minified upstream → 2-space pretty so git diffs are reviewable.
  writeFileSync(args.out, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  console.log(
    `[spec-fetch] wrote ${relative(repoRoot, args.out)} ` +
      `(${spec.info?.title ?? "?"} ${spec.info?.version ?? "?"})`,
  );
  console.log(`[spec-fetch] next: pnpm spec:diff && pnpm generate`);
}

main().catch((err) => {
  console.error(`[spec-fetch] ${(err as Error).message}`);
  process.exit(1);
});
