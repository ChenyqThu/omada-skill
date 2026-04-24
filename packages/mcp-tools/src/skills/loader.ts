import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatter, splitFrontmatter } from "./frontmatter.js";
import type { SkillDescriptor, SkillIssue } from "./types.js";

/** Prefix for MCP resource URIs published by this server. */
export const SKILL_RESOURCE_PREFIX = "resource://omada-skills/";

/** MIME type used when publishing skills as MCP resources. */
export const SKILL_MIME_TYPE = "text/markdown";

/**
 * Walk `<root>/<slug>/SKILL.md` and return the valid skills plus any
 * frontmatter / layout issues the loader surfaced.
 *
 * Intentionally synchronous — the workload is a handful of small markdown
 * files, and the caller is almost always the MCP server startup path where
 * we want a deterministic "everything or nothing" shape before the server
 * begins answering.
 */
export function loadSkillsFromDir(root: string): {
  skills: SkillDescriptor[];
  issues: SkillIssue[];
} {
  const skills: SkillDescriptor[] = [];
  const issues: SkillIssue[] = [];

  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch (err) {
    issues.push({
      path: root,
      message: `skills directory unreadable: ${err instanceof Error ? err.message : String(err)}`,
      severity: "error",
    });
    return { skills, issues };
  }

  for (const slug of entries.sort()) {
    const dir = join(root, slug);
    let entryStat;
    try {
      entryStat = statSync(dir);
    } catch {
      continue;
    }
    if (!entryStat.isDirectory()) continue;

    const file = join(dir, "SKILL.md");
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      issues.push({ path: file, message: "SKILL.md missing", severity: "error" });
      continue;
    }

    const { frontmatter: block, body } = splitFrontmatter(raw);
    if (block === null) {
      issues.push({
        path: file,
        message: "SKILL.md has no YAML frontmatter block",
        severity: "error",
      });
      continue;
    }

    const { frontmatter, issues: parseIssues } = parseFrontmatter(block, file);
    issues.push(...parseIssues);
    if (!frontmatter) continue;

    if (frontmatter.name !== slug) {
      issues.push({
        path: file,
        message: `frontmatter name "${frontmatter.name}" does not match directory "${slug}"`,
        severity: "error",
      });
      continue;
    }

    skills.push({
      name: frontmatter.name,
      slug,
      frontmatter,
      body: body.trimStart(),
      raw,
      path: file,
      uri: SKILL_RESOURCE_PREFIX + slug,
    });
  }

  return { skills, issues };
}

/**
 * Structural lint: which companion assets `docs/skills.md` says each skill
 * should ship. Missing assets are reported as `warn` — they don't block
 * publishing, but the `scripts/validate-skills.ts` CLI elevates them to
 * errors with `--strict`.
 */
export function lintSkillLayout(
  skill: SkillDescriptor,
  options: { strict?: boolean } = {},
): SkillIssue[] {
  const dir = skill.path.slice(0, skill.path.length - "SKILL.md".length);
  const severity: SkillIssue["severity"] = options.strict ? "error" : "warn";
  const out: SkillIssue[] = [];

  const check = (relative: string, message: string): void => {
    try {
      statSync(join(dir, relative));
    } catch {
      out.push({ path: skill.path, message, severity });
    }
  };

  check("RESOURCES.md", "RESOURCES.md missing — add glossary / reference tables");
  check("examples", "examples/ directory missing — add at least one transcript");
  check("checklists", "checklists/ directory missing — add a runbook / preflight");

  return out;
}
