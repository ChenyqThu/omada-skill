#!/usr/bin/env tsx
/**
 * Diff the current OpenAPI spec against the latest snapshot, at the level of
 * granularity the SDK cares about: operations (operationId / method / path /
 * deprecated / summary).
 *
 *   pnpm spec:diff                         # against specs/snapshots/<latest>.json
 *   pnpm spec:diff --baseline <path>       # explicit baseline
 *   pnpm spec:diff --output <path>         # write markdown to file instead of stdout
 *   pnpm spec:diff --fail-on-change        # exit 1 when there are any changes
 *
 * The schema-level diff (request/response shapes) is deliberately out of
 * scope — for that, regenerate via `pnpm generate` and review the resulting
 * `packages/sdk/src/generated/schema.d.ts` hunk in PR review.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  deprecated?: boolean;
  tags?: string[];
}
interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
}
interface OpenAPISpec {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, OpenAPIPathItem>;
}

interface OperationEntry {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  deprecated: boolean;
  tags: string[];
}

interface Args {
  currentPath: string;
  baselinePath: string | null;
  output: string | null;
  failOnChange: boolean;
  failOnBreaking: boolean;
}

function parseArgs(argv: string[], repoRoot: string): Args {
  const out: Args = {
    currentPath: resolve(repoRoot, "specs/omada_api.json"),
    baselinePath: null,
    output: null,
    failOnChange: false,
    failOnBreaking: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--baseline") {
      out.baselinePath = resolve(repoRoot, requireValue(args, i, "--baseline"));
      i += 1;
    } else if (a === "--current") {
      out.currentPath = resolve(repoRoot, requireValue(args, i, "--current"));
      i += 1;
    } else if (a === "--output") {
      out.output = resolve(repoRoot, requireValue(args, i, "--output"));
      i += 1;
    } else if (a === "--fail-on-change") {
      out.failOnChange = true;
    } else if (a === "--fail-on-breaking") {
      out.failOnBreaking = true;
    } else {
      console.error(`[spec-diff] unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

/**
 * Classify a diff entry as breaking.
 *
 * - Any removed operation is breaking (SDK callers disappear at compile time).
 * - Changed method/path is breaking (the operation moved; generated callers
 *   would send requests to the wrong endpoint).
 * - Newly deprecated operations are NOT breaking — callers still work, but
 *   we surface them in the comment.
 * - Summary-only changes are documentation, not breaking.
 * - Pure additions are never breaking.
 */
function isBreaking(diff: Diff): boolean {
  if (diff.removed.length > 0) return true;
  return diff.changed.some((c) => c.fields.includes("method") || c.fields.includes("path"));
}

function requireValue(args: string[], i: number, flag: string): string {
  const v = args[i + 1];
  if (!v) {
    console.error(`[spec-diff] ${flag} requires a value`);
    process.exit(2);
  }
  return v;
}

function latestSnapshot(snapshotDir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(snapshotDir).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;
  entries.sort();
  return resolve(snapshotDir, entries[entries.length - 1]!);
}

function loadSpec(path: string): OpenAPISpec {
  return JSON.parse(readFileSync(path, "utf8")) as OpenAPISpec;
}

function indexOperations(spec: OpenAPISpec): Map<string, OperationEntry> {
  const map = new Map<string, OperationEntry>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op?.operationId) continue;
      map.set(op.operationId, {
        operationId: op.operationId,
        method,
        path,
        deprecated: op.deprecated ?? false,
        tags: op.tags ?? [],
        ...(op.summary !== undefined ? { summary: op.summary } : {}),
      });
    }
  }
  return map;
}

interface Diff {
  version: { baseline: string | undefined; current: string | undefined };
  added: OperationEntry[];
  removed: OperationEntry[];
  changed: Array<{
    id: string;
    baseline: OperationEntry;
    current: OperationEntry;
    fields: string[];
  }>;
}

function diffOperations(
  baseline: Map<string, OperationEntry>,
  current: Map<string, OperationEntry>,
): { added: Diff["added"]; removed: Diff["removed"]; changed: Diff["changed"] } {
  const added: Diff["added"] = [];
  const removed: Diff["removed"] = [];
  const changed: Diff["changed"] = [];

  for (const [id, entry] of current) {
    const prior = baseline.get(id);
    if (!prior) {
      added.push(entry);
      continue;
    }
    const fields: string[] = [];
    if (prior.method !== entry.method) fields.push("method");
    if (prior.path !== entry.path) fields.push("path");
    if (prior.deprecated !== entry.deprecated) fields.push("deprecated");
    if ((prior.summary ?? "") !== (entry.summary ?? "")) fields.push("summary");
    if (fields.length > 0) changed.push({ id, baseline: prior, current: entry, fields });
  }

  for (const [id, entry] of baseline) {
    if (!current.has(id)) removed.push(entry);
  }

  added.sort((a, b) => a.operationId.localeCompare(b.operationId));
  removed.sort((a, b) => a.operationId.localeCompare(b.operationId));
  changed.sort((a, b) => a.id.localeCompare(b.id));

  return { added, removed, changed };
}

function renderMarkdown(diff: Diff, paths: { baseline: string; current: string }): string {
  const lines: string[] = [];
  lines.push("# Omada OpenAPI diff");
  lines.push("");
  lines.push(
    `- **Baseline**: \`${paths.baseline}\`${diff.version.baseline ? ` (${diff.version.baseline})` : ""}`,
  );
  lines.push(
    `- **Current**:  \`${paths.current}\`${diff.version.current ? ` (${diff.version.current})` : ""}`,
  );
  lines.push(
    `- **Summary**: ${diff.added.length} added · ${diff.removed.length} removed · ${diff.changed.length} changed`,
  );
  lines.push("");

  if (diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0) {
    lines.push("No operation-level changes.");
    lines.push("");
    return lines.join("\n");
  }

  if (diff.added.length > 0) {
    lines.push(`## Added (${diff.added.length})`);
    lines.push("");
    for (const e of diff.added)
      lines.push(`- \`${e.operationId}\` — ${e.method.toUpperCase()} ${e.path}`);
    lines.push("");
  }

  if (diff.removed.length > 0) {
    lines.push(`## Removed (${diff.removed.length})`);
    lines.push("");
    for (const e of diff.removed)
      lines.push(`- \`${e.operationId}\` — ${e.method.toUpperCase()} ${e.path}`);
    lines.push("");
  }

  if (diff.changed.length > 0) {
    lines.push(`## Changed (${diff.changed.length})`);
    lines.push("");
    for (const c of diff.changed) {
      lines.push(`- \`${c.id}\` (${c.fields.join(", ")})`);
      if (c.fields.includes("method") || c.fields.includes("path")) {
        lines.push(`  - was: ${c.baseline.method.toUpperCase()} ${c.baseline.path}`);
        lines.push(`  - now: ${c.current.method.toUpperCase()} ${c.current.path}`);
      }
      if (c.fields.includes("deprecated")) {
        lines.push(`  - deprecated: ${c.baseline.deprecated} → ${c.current.deprecated}`);
      }
      if (c.fields.includes("summary")) {
        lines.push(
          `  - summary: ${JSON.stringify(c.baseline.summary ?? "")} → ${JSON.stringify(c.current.summary ?? "")}`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function main(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, "..");
  const args = parseArgs(process.argv, repoRoot);

  const baselinePath = args.baselinePath ?? latestSnapshot(resolve(repoRoot, "specs/snapshots"));
  if (!baselinePath) {
    console.error("[spec-diff] no baseline snapshot found in specs/snapshots/");
    process.exit(1);
  }

  const baselineSpec = loadSpec(baselinePath);
  const currentSpec = loadSpec(args.currentPath);

  const diff: Diff = {
    version: {
      baseline: baselineSpec.info?.version,
      current: currentSpec.info?.version,
    },
    ...diffOperations(indexOperations(baselineSpec), indexOperations(currentSpec)),
  };

  const markdown = renderMarkdown(diff, {
    baseline: relative(repoRoot, baselinePath),
    current: relative(repoRoot, args.currentPath),
  });

  if (args.output) {
    writeFileSync(args.output, markdown, "utf8");
    console.log(`[spec-diff] wrote ${relative(repoRoot, args.output)}`);
  } else {
    process.stdout.write(markdown);
  }

  const changeCount = diff.added.length + diff.removed.length + diff.changed.length;
  if (args.failOnChange && changeCount > 0) {
    console.error(`[spec-diff] exiting 1 (${changeCount} change(s), --fail-on-change set)`);
    process.exit(1);
  }
  if (args.failOnBreaking && isBreaking(diff)) {
    console.error(
      `[spec-diff] exiting 1 — spec contains breaking operation change(s) ` +
        `(removed: ${diff.removed.length}, method/path-changed: ${diff.changed.filter((c) => c.fields.includes("method") || c.fields.includes("path")).length})`,
    );
    process.exit(1);
  }
}

main();
