import type { SkillFrontmatter, SkillIssue } from "./types.js";

const KNOWN_KEYS = new Set(["name", "description", "version", "tags", "requires-mcp-server"]);

/**
 * Split a raw SKILL.md into its frontmatter block and the body underneath.
 * Returns `frontmatter = null` if the file doesn't start with a `---` fence.
 */
export function splitFrontmatter(raw: string): { frontmatter: string | null; body: string } {
  // Permit a leading UTF-8 BOM and trim preceding whitespace that prettier
  // occasionally introduces. The first non-blank line must be exactly `---`.
  const source = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { frontmatter: null, body: source };
  return {
    frontmatter: match[1] ?? "",
    body: source.slice(match[0].length),
  };
}

/**
 * Parse the YAML frontmatter shapes that `docs/skills.md` sanctions:
 * - `name: slug`
 * - `description: |` multi-line block scalar (the common case)
 * - `version: 0.1.0`
 * - `tags: [a, b, c]` inline array
 * - `requires-mcp-server: omada-skill>=0.1`
 *
 * Deliberately narrow — we don't pull a YAML dependency in. Unknown shapes
 * (nested maps, flow-scalar multi-line descriptions, etc.) fall through as
 * `SkillIssue`s rather than crashing the loader.
 */
export function parseFrontmatter(
  block: string,
  path: string,
): { frontmatter: SkillFrontmatter | null; issues: SkillIssue[] } {
  const issues: SkillIssue[] = [];
  const fm: Partial<SkillFrontmatter> = { tags: [], extras: {} };

  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      i += 1;
      continue;
    }

    // Only top-level keys are meaningful for our shapes. Reject indented rows
    // that don't follow a known block scalar — they indicate unsupported nesting.
    const keyMatch = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s?(.*)$/.exec(line);
    if (!keyMatch) {
      issues.push({
        path,
        message: `unparseable frontmatter line: ${JSON.stringify(line)}`,
        severity: "error",
      });
      i += 1;
      continue;
    }

    const key = keyMatch[1] ?? "";
    const inlineValue = (keyMatch[2] ?? "").trim();

    if (inlineValue === "|" || inlineValue === ">") {
      // Multi-line block scalar. Collect all subsequent lines that are indented
      // at least 2 spaces. `|` keeps newlines; `>` folds them into spaces.
      const collected: string[] = [];
      let j = i + 1;
      let firstIndent = -1;
      while (j < lines.length) {
        const peek = lines[j] ?? "";
        if (peek.trim() === "") {
          collected.push("");
          j += 1;
          continue;
        }
        const indent = peek.length - peek.trimStart().length;
        if (indent === 0) break;
        if (firstIndent === -1) firstIndent = indent;
        const trimLen = Math.min(indent, firstIndent);
        collected.push(peek.slice(trimLen));
        j += 1;
      }
      const joined =
        inlineValue === "|"
          ? collected.join("\n").replace(/\n+$/, "")
          : collected.join(" ").replace(/\s+/g, " ").trim();
      assignKey(fm, key, joined, path, issues);
      i = j;
      continue;
    }

    assignKey(fm, key, dequote(inlineValue), path, issues);
    i += 1;
  }

  for (const required of ["name", "description", "version"] as const) {
    if (fm[required] === undefined || fm[required] === "") {
      issues.push({
        path,
        message: `missing required frontmatter key: ${required}`,
        severity: "error",
      });
    }
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return { frontmatter: null, issues };
  }

  return {
    frontmatter: {
      name: fm.name!,
      description: fm.description!,
      version: fm.version!,
      tags: fm.tags ?? [],
      ...(fm.requiresMcpServer !== undefined ? { requiresMcpServer: fm.requiresMcpServer } : {}),
      extras: fm.extras ?? {},
    },
    issues,
  };
}

function assignKey(
  fm: Partial<SkillFrontmatter>,
  key: string,
  value: string,
  path: string,
  issues: SkillIssue[],
): void {
  switch (key) {
    case "name":
      fm.name = value;
      return;
    case "description":
      fm.description = value;
      return;
    case "version":
      fm.version = value;
      return;
    case "tags":
      fm.tags = parseInlineArray(value, path, issues);
      return;
    case "requires-mcp-server":
      fm.requiresMcpServer = value;
      return;
    default:
      if (!KNOWN_KEYS.has(key)) {
        fm.extras ??= {};
        fm.extras[key] = value;
      }
  }
}

function parseInlineArray(value: string, path: string, issues: SkillIssue[]): string[] {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "[]") return [];
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    issues.push({
      path,
      message: `expected inline array for tags, got ${JSON.stringify(trimmed)}`,
      severity: "error",
    });
    return [];
  }
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((t) => dequote(t.trim()))
    .filter((t) => t.length > 0);
}

function dequote(raw: string): string {
  if (raw.length >= 2 && (raw.startsWith('"') || raw.startsWith("'"))) {
    const quote = raw[0]!;
    if (raw.endsWith(quote)) return raw.slice(1, -1);
  }
  return raw;
}
