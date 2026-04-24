/**
 * Skill types — shared by the frontmatter parser, the filesystem loader, and
 * the MCP resource publisher in `apps/mcp-server`.
 *
 * Skills are pure-markdown agents under `skills/<slug>/`. Each one ships a
 * SKILL.md with a YAML frontmatter block. See `docs/skills.md` for the
 * authoring convention.
 */

/**
 * Parsed frontmatter block from a SKILL.md. Only the keys M4 actually ships
 * are modelled; unknown keys are preserved in `extras` so future skill
 * authors can experiment without patching the loader.
 */
export interface SkillFrontmatter {
  /** Skill slug. Must match the containing directory name. */
  name: string;
  /** Free-text description with TRIGGER / SKIP lines. Multi-line allowed. */
  description: string;
  /** SemVer string, e.g. "0.1.0". Stored verbatim; not parsed. */
  version: string;
  /** Optional tag list. Empty array if the key is missing. */
  tags: string[];
  /**
   * Minimum MCP server version this skill expects, e.g. "omada-skill>=0.1".
   * Stored verbatim and surfaced to clients as a resource hint; enforcement
   * (if any) is the client's call, not the loader's.
   */
  requiresMcpServer?: string;
  /** Any unrecognised frontmatter keys, preserved verbatim. */
  extras: Record<string, string>;
}

/**
 * Fully-loaded skill — frontmatter + body text + filesystem origin.
 */
export interface SkillDescriptor {
  /** Slug (also the directory name). Primary identity. */
  name: string;
  /** Directory name as observed on disk. Matches `name` for well-formed skills. */
  slug: string;
  /** Parsed frontmatter. */
  frontmatter: SkillFrontmatter;
  /** Markdown body *without* the frontmatter block. */
  body: string;
  /** Raw SKILL.md contents, including the frontmatter. */
  raw: string;
  /** Absolute path to SKILL.md on disk. */
  path: string;
  /** MCP resource URI: `resource://omada-skills/<slug>`. */
  uri: string;
}

/**
 * Why the loader rejected (or warned about) a particular skill. Emitted from
 * both the pure parser and the filesystem loader; the CLI validator
 * (`scripts/validate-skills.ts`) surfaces these to the operator.
 */
export interface SkillIssue {
  /** Absolute or workspace-relative path of the file that failed. */
  path: string;
  /** One-line human-readable message. Safe to print. */
  message: string;
  /** `"error"` blocks the skill from being published; `"warn"` doesn't. */
  severity: "error" | "warn";
}
