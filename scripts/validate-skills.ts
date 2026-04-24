#!/usr/bin/env tsx
/**
 * Validate the `skills/**` tree.
 *
 *   pnpm skill:validate            # warnings for missing assets
 *   pnpm skill:validate --strict   # treat asset warnings as errors
 *
 * Exits non-zero on any `error`-severity issue, zero otherwise. Intended for
 * pre-commit hooks and CI — `@omada/mcp-tools` does the actual parsing.
 */
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { lintSkillLayout, loadSkillsFromDir } from "../packages/mcp-tools/src/skills/index.js";
import type { SkillIssue } from "../packages/mcp-tools/src/skills/types.js";

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
      `${errors.length} error(s), ${warnings.length} warning(s)`,
  );

  if (errors.length > 0) process.exit(1);
}

main();
