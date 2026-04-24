import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SKILL_MIME_TYPE,
  SKILL_RESOURCE_PREFIX,
  lintSkillLayout,
  loadSkillsFromDir,
  parseFrontmatter,
  splitFrontmatter,
} from "../src/skills/index.js";

function makeTempRoot(): string {
  return mkdtempSync(join(tmpdir(), "omada-skill-test-"));
}

function writeSkill(
  root: string,
  slug: string,
  opts: { frontmatter: string; body: string; withAssets?: boolean },
): string {
  const dir = join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\n${opts.frontmatter}\n---\n\n${opts.body}`, "utf8");
  if (opts.withAssets) {
    writeFileSync(join(dir, "RESOURCES.md"), "# resources\n", "utf8");
    mkdirSync(join(dir, "examples"), { recursive: true });
    writeFileSync(join(dir, "examples", "e.md"), "# example\n", "utf8");
    mkdirSync(join(dir, "checklists"), { recursive: true });
    writeFileSync(join(dir, "checklists", "c.md"), "# checklist\n", "utf8");
  }
  return dir;
}

describe("splitFrontmatter", () => {
  it("returns the block and the body when a fence is present", () => {
    const raw = "---\nname: foo\n---\n\nbody starts here";
    const { frontmatter, body } = splitFrontmatter(raw);
    expect(frontmatter).toBe("name: foo");
    expect(body).toBe("\nbody starts here");
  });

  it("returns frontmatter: null when no fence is present", () => {
    const { frontmatter, body } = splitFrontmatter("no frontmatter here");
    expect(frontmatter).toBeNull();
    expect(body).toBe("no frontmatter here");
  });

  it("tolerates a leading BOM", () => {
    const raw = "\uFEFF---\nname: foo\n---\nbody";
    const { frontmatter } = splitFrontmatter(raw);
    expect(frontmatter).toBe("name: foo");
  });
});

describe("parseFrontmatter", () => {
  it("parses the M4 shape (name/description|/version/tags[])", () => {
    const { frontmatter, issues } = parseFrontmatter(
      [
        "name: omada-demo",
        "description: |",
        "  TRIGGER when demo.",
        "  SKIP when not demo.",
        "version: 0.1.0",
        "tags: [omada, demo]",
        "requires-mcp-server: omada-skill>=0.1",
      ].join("\n"),
      "fixture",
    );
    expect(issues).toEqual([]);
    expect(frontmatter).toMatchObject({
      name: "omada-demo",
      version: "0.1.0",
      tags: ["omada", "demo"],
      requiresMcpServer: "omada-skill>=0.1",
    });
    expect(frontmatter?.description).toContain("TRIGGER when demo.");
    expect(frontmatter?.description).toContain("SKIP when not demo.");
  });

  it("flags missing required keys as errors", () => {
    const { frontmatter, issues } = parseFrontmatter("tags: [x]", "fixture");
    expect(frontmatter).toBeNull();
    const keys = issues.filter((i) => i.severity === "error").map((i) => i.message);
    expect(keys).toContain("missing required frontmatter key: name");
    expect(keys).toContain("missing required frontmatter key: description");
    expect(keys).toContain("missing required frontmatter key: version");
  });

  it("preserves unknown keys under `extras`", () => {
    const { frontmatter } = parseFrontmatter(
      ["name: s", "description: d", "version: 0", "owner: alice"].join("\n"),
      "fixture",
    );
    expect(frontmatter?.extras).toEqual({ owner: "alice" });
  });

  it("rejects malformed tags arrays", () => {
    const { issues } = parseFrontmatter(
      ["name: s", "description: d", "version: 0", "tags: not-an-array"].join("\n"),
      "fixture",
    );
    expect(issues.some((i) => i.message.includes("expected inline array"))).toBe(true);
  });
});

describe("loadSkillsFromDir", () => {
  it("loads the real M4 skills from the repo skills/ directory", () => {
    const { skills, issues } = loadSkillsFromDir(join(__dirname, "..", "..", "..", "skills"));
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual([
      "omada-alert-triage",
      "omada-bulk-site-onboard",
      "omada-guest-portal-wizard",
      "omada-support-assist",
      "omada-wifi-troubleshoot",
    ]);
    for (const skill of skills) {
      expect(skill.uri).toBe(`${SKILL_RESOURCE_PREFIX}${skill.slug}`);
      expect(skill.frontmatter.tags).toContain("omada");
      expect(skill.body.length).toBeGreaterThan(100);
    }
  });

  it("rejects a skill whose frontmatter name does not match its directory", () => {
    const root = makeTempRoot();
    try {
      writeSkill(root, "slug-a", {
        frontmatter: "name: slug-b\ndescription: d\nversion: 0",
        body: "body",
        withAssets: true,
      });
      const { skills, issues } = loadSkillsFromDir(root);
      expect(skills).toHaveLength(0);
      expect(issues.some((i) => i.message.includes("does not match directory"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records warnings for missing companion assets when lintSkillLayout runs", () => {
    const root = makeTempRoot();
    try {
      writeSkill(root, "lean", {
        frontmatter: "name: lean\ndescription: d\nversion: 0",
        body: "body",
      });
      const { skills } = loadSkillsFromDir(root);
      const issues = lintSkillLayout(skills[0]!);
      const messages = issues.map((i) => i.message);
      expect(messages).toEqual(
        expect.arrayContaining([
          expect.stringContaining("RESOURCES.md missing"),
          expect.stringContaining("examples/ directory missing"),
          expect.stringContaining("checklists/ directory missing"),
        ]),
      );
      expect(issues.every((i) => i.severity === "warn")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("elevates layout warnings to errors under `strict`", () => {
    const root = makeTempRoot();
    try {
      writeSkill(root, "lean", {
        frontmatter: "name: lean\ndescription: d\nversion: 0",
        body: "body",
      });
      const { skills } = loadSkillsFromDir(root);
      const issues = lintSkillLayout(skills[0]!, { strict: true });
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((i) => i.severity === "error")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("constants", () => {
  it("expose the canonical resource prefix and mime type", () => {
    expect(SKILL_RESOURCE_PREFIX).toBe("resource://omada-skills/");
    expect(SKILL_MIME_TYPE).toBe("text/markdown");
  });
});
