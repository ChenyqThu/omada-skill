import { z } from "zod";

import { defineTool } from "../../registry.js";
import { runTwoPhase } from "../../helpers/two_phase.js";

const FileServerConfig = z.object({
  protocol: z.enum(["FTP", "SFTP", "TFTP", "SCP"]),
  hostname: z.string().min(1).max(128),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(128).optional(),
  password: z.string().min(1).max(128).optional(),
});

const SiteImportConfig = z.object({
  filePath: z.string().min(1),
  siteName: z.string().min(1).max(64),
  skipDevice: z.boolean().optional(),
});

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  fileServerConfig: FileServerConfig.describe(
    "Protocol + host for the backup file server the controller pulls from.",
  ),
  siteImportConfigList: z
    .array(SiteImportConfig)
    .min(1)
    .max(300)
    .describe("Per-site import entries (1–300). Each names one backup file."),
  confirmToken: z
    .string()
    .optional()
    .describe("Token from the preview phase. Omit to receive a plan + new token."),
});

export const omadaBulkOnboardTool = defineTool({
  name: "omada_bulk_onboard",
  title: "Bulk-onboard Omada sites from templates",
  description:
    "Two-phase tool: create up to 300 sites by importing backup configs off a " +
    "file server (batchSiteImport). Phase 1 returns a preview + confirm token; " +
    "phase 2 replays the token to execute. MSP workhorse.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, fileServerConfig, siteImportConfigList, confirmToken } = input;

    const plan = {
      operation: "batchSiteImport",
      omadacId,
      fileServer: `${fileServerConfig.protocol}://${fileServerConfig.hostname}:${fileServerConfig.port}`,
      sites: siteImportConfigList.map((s) => ({
        siteName: s.siteName,
        filePath: s.filePath,
        skipDevice: s.skipDevice ?? false,
      })),
    };

    return runTwoPhase(ctx, {
      operations: ["batchSiteImport"],
      plan,
      confirmToken,
      renderPreview: (p) => {
        const sites = p["sites"] as { siteName: string; filePath: string }[];
        const first = sites.slice(0, 5).map((s) => `    • ${s.siteName} ← ${s.filePath}`);
        const more = sites.length > 5 ? `\n    … ${sites.length - 5} more sites` : "";
        return `Would import ${sites.length} site(s) from ${p["fileServer"] as string}:\n${first.join("\n")}${more}`;
      },
      execute: () =>
        ctx.client.call("batchSiteImport", {
          path: { omadacId },
          body: {
            fileServerConfig,
            siteImportConfigList,
          },
        }),
      renderSuccess: (p, result) => {
        const errorCode = (result as { errorCode?: number }).errorCode;
        if (errorCode !== undefined && errorCode !== 0) {
          return `batchSiteImport FAILED: errorCode=${errorCode} msg=${(result as { msg?: string }).msg ?? "unknown"}`;
        }
        const created = (p["sites"] as unknown[]).length;
        return `Submitted ${created} site import(s) on controller ${p["omadacId"] as string}.`;
      },
    });
  },
});
