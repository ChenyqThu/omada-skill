#!/usr/bin/env tsx
/**
 * Validate the `skills/**` tree.
 *
 *   pnpm skill:validate            # warnings for missing assets
 *   pnpm skill:validate --strict   # treat asset warnings as errors
 *
 * Exits non-zero on any `error`-severity issue, zero otherwise. Intended for
 * pre-commit hooks and CI — `@omada/mcp-tools` does the actual parsing.
 *
 * Cross-validation: every `omada_*` and `omada-*` token that appears inside a
 * `SKILL.md` must resolve to either a tool registered in
 * `createDefaultRegistry()` or another sibling skill id. Catches renames /
 * deletions at pre-commit time instead of at runtime when a client can't find
 * the tool.
 */
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { lintSkillLayout, loadSkillsFromDir } from "../packages/mcp-tools/src/skills/index.js";
import { createDefaultRegistry } from "../packages/mcp-tools/src/tools/index.js";
import type { SkillDescriptor, SkillIssue } from "../packages/mcp-tools/src/skills/types.js";

interface Args {
  strict: boolean;
  dir: string;
}

function parseArgs(argv: string[], repoRoot: string): Args {
  const args = argv.slice(2);
  let strict = false;
  let dir = resolve(repoRoot, "skills");
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--strict") strict = true;
    else if (a === "--dir") {
      const v = args[i + 1];
      if (!v) {
        console.error("[validate-skills] --dir requires a path");
        process.exit(2);
      }
      dir = resolve(repoRoot, v);
      i += 1;
    } else {
      console.error(`[validate-skills] unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return { strict, dir };
}

/**
 * Extract `omada_*` tool references (snake_case) and `omada-*` skill slug
 * references (kebab-case) from a SKILL.md body. We look for tokens inside
 * inline code (` ` `) or as bare words delimited by non-word chars; either
 * pattern is how authors actually reference them in the shipping skills.
 */
function extractReferences(body: string): { tools: Set<string>; skills: Set<string> } {
  const tools = new Set<string>();
  const skills = new Set<string>();
  // Snake_case `omada_word_word` — tool names. Tokens must not end with `_`.
  for (const match of body.matchAll(/omada_[a-z0-9_]+/g)) {
    const token = match[0].replace(/_+$/, "");
    if (token.length > "omada_".length) tools.add(token);
  }
  // Kebab-case `omada-word-word` — skill slugs. Tokens must not end with `-`
  // (a dangling hyphen typically means a line-wrap; the validator's job is to
  // flag that at the author, but the regex itself shouldn't emit a bogus
  // reference). Exclude the literal `omada-skill` server-version token.
  for (const match of body.matchAll(/omada-[a-z0-9-]+/g)) {
    const token = match[0].replace(/-+$/, "");
    if (token === "omada-skill") continue;
    if (token.length > "omada-".length) skills.add(token);
  }
  return { tools, skills };
}

function main(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, "..");
  const { strict, dir } = parseArgs(process.argv, repoRoot);

  console.log(`[validate-skills] scanning ${relative(repoRoot, dir)}/`);

  const { skills, issues: loadIssues } = loadSkillsFromDir(dir);
  const issues: SkillIssue[] = [...loadIssues];
  for (const skill of skills) {
    issues.push(...lintSkillLayout(skill, { strict }));
  }

  if (skills.length === 0) {
    console.error("[validate-skills] no skills found");
    process.exit(1);
  }

  // Build the ground-truth sets of valid tool names and skill slugs.
  const registry = createDefaultRegistry();
  const knownTools = new Set(registry.list().map((t) => t.name));
  const knownSkills = new Set(skills.map((s) => s.frontmatter.name));

  // Cross-reference every SKILL.md body / path against the registry + sibling
  // skills. Do it by re-reading from disk so we can report with byte-accurate
  // paths rather than trusting a cache.
  for (const skill of skills) {
    const raw = readSkillBody(skill);
    const { tools, skills: skillRefs } = extractReferences(raw);
    for (const toolRef of tools) {
      if (!knownTools.has(toolRef)) {
        issues.push({
          path: skill.path,
          message: `references unknown tool "${toolRef}" — not in createDefaultRegistry()`,
          severity: "error",
        });
      }
    }
    for (const skillRef of skillRefs) {
      if (skillRef === skill.frontmatter.name) continue; // self-reference
      if (!knownSkills.has(skillRef)) {
        issues.push({
          path: skill.path,
          message: `references unknown skill "${skillRef}" — no sibling skill under skills/ has that name`,
          severity: "error",
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warn");

  for (const w of warnings) {
    console.warn(`  warn  ${relative(repoRoot, w.path)}: ${w.message}`);
  }
  for (const e of errors) {
    console.error(`  error ${relative(repoRoot, e.path)}: ${e.message}`);
  }

  console.log(
    `[validate-skills] ${skills.length} skill(s) parsed; ` +
      `${errors.length} error(s), ${warnings.length} warning(s); ` +
      `${knownTools.size} tool(s) and ${knownSkills.size} skill(s) in ground-truth set`,
  );

  if (errors.length > 0) process.exit(1);
}

function readSkillBody(skill: SkillDescriptor): string {
  try {
    return readFileSync(skill.path, "utf8");
  } catch {
    return "";
  }
}

main();
