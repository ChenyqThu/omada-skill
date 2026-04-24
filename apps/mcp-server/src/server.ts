import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SKILL_MIME_TYPE, createDefaultRegistry, loadSkillsFromDir } from "@omada/mcp-tools";
import type { SkillDescriptor, ToolRegistry } from "@omada/mcp-tools";
import type { OmadaClient } from "@omada/sdk";
import type { Logger } from "@omada/shared";

export interface BuildMcpServerOptions {
  client: OmadaClient;
  logger: Logger;
  registry?: ToolRegistry;
  /**
   * Pre-loaded skill descriptors. If omitted, `buildMcpServer` will resolve
   * `skillsDir` (explicit override or the repo-default) and load from disk.
   * Tests normally pass `skills: []` or an in-memory list.
   */
  skills?: SkillDescriptor[];
  /**
   * Override the filesystem root that contains `<slug>/SKILL.md` directories.
   * Defaults to `<repoRoot>/skills` derived from the compiled file location.
   */
  skillsDir?: string;
}

export function buildMcpServer(opts: BuildMcpServerOptions): Server {
  const registry = opts.registry ?? createDefaultRegistry();
  const skills = resolveSkills(opts);
  const skillByUri = new Map(skills.map((s) => [s.uri, s]));

  const server = new Server(
    { name: "omada-mcp", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
        ...(skills.length > 0 ? { resources: {} } : {}),
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list().map((d) => ({
      name: d.name,
      ...(d.title !== undefined ? { title: d.title } : {}),
      description: d.description,
      inputSchema: d.inputSchema as Record<string, unknown>,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const result = await registry.call(name, args ?? {}, {
      client: opts.client,
      logger: opts.logger.child("tool"),
    });
    return result as Awaited<ReturnType<Parameters<typeof server.setRequestHandler>[1]>>;
  });

  if (skills.length > 0) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: skills.map((s) => ({
        uri: s.uri,
        name: s.name,
        description: firstDescriptionLine(s.frontmatter.description),
        mimeType: SKILL_MIME_TYPE,
      })),
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
      const { uri } = req.params;
      const skill = skillByUri.get(uri);
      if (!skill) {
        throw new Error(`Unknown resource URI: ${uri}`);
      }
      return {
        contents: [
          {
            uri: skill.uri,
            mimeType: SKILL_MIME_TYPE,
            text: skill.raw,
          },
        ],
      };
    });
  }

  return server;
}

/**
 * Default skill directory — `<repoRoot>/skills` relative to the compiled
 * server module. Works for both the built `dist/server.js` and the
 * `tsx`-driven dev path (`src/server.ts`).
 */
export function defaultSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/server.js or src/server.ts → apps/mcp-server/{dist|src} → apps/mcp-server → apps → <repo>
  return resolve(here, "..", "..", "..", "skills");
}

function resolveSkills(opts: BuildMcpServerOptions): SkillDescriptor[] {
  if (opts.skills !== undefined) return opts.skills;
  const dir = opts.skillsDir ?? defaultSkillsDir();
  const { skills, issues } = loadSkillsFromDir(dir);
  for (const issue of issues) {
    if (issue.severity === "error") {
      opts.logger.error("skill load issue", { path: issue.path, message: issue.message });
    } else {
      opts.logger.warn("skill load issue", { path: issue.path, message: issue.message });
    }
  }
  return skills;
}

function firstDescriptionLine(description: string): string {
  const first = description
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return first ?? description;
}
