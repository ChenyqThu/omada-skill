import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";
import { runTwoPhase } from "../../helpers/two_phase.js";
import { operations, type OperationId } from "@omada/sdk";

const InputSchema = z.object({
  operationId: z
    .string()
    .min(1)
    .describe(
      "Exact Omada OpenAPI operationId to invoke (e.g. getSiteList). " +
        "Use the raw operation name — the tool refuses unknown IDs.",
    ),
  path: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional()
    .describe("Path parameters matching the operation's path template."),
  query: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Query parameters forwarded verbatim."),
  body: z.unknown().optional().describe("JSON body for non-GET operations."),
  confirmToken: z
    .string()
    .optional()
    .describe("Required for any non-GET operationId. GETs run without confirmation."),
});

export const omadaScriptTool = defineTool({
  name: "omada_script",
  title: "Omada raw OpenAPI escape hatch",
  description:
    "Advanced-only: invoke ANY registered Omada OpenAPI operationId by name, " +
    "bypassing the purpose-built tools. GETs run immediately; non-GETs require " +
    "a confirm_token handshake, with severity derived from the guardrails " +
    "whitelist. Prefer a purpose-built tool whenever one exists.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { operationId, path, query, body, confirmToken } = input;
    const info = (operations as Record<string, { method: string; path: string } | undefined>)[
      operationId
    ];
    if (!info) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown operationId: ${operationId}. Only registered Omada operations are allowed.`,
          },
        ],
      };
    }

    const isRead = info.method === "get";
    if (isRead) {
      ctx.logger.debug("omada_script (read)", { operationId, path: info.path });
      try {
        const response = await ctx.client.call(operationId as OperationId, {
          ...(path !== undefined ? { path } : {}),
          ...(query !== undefined ? { query } : {}),
        });
        return textResult(
          `GET ${info.path} ran successfully — see structuredContent for the raw payload.`,
          { operationId, method: info.method, path: info.path, response },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: `Call failed: ${message}` }],
        };
      }
    }

    const plan = {
      operation: operationId,
      method: info.method,
      apiPath: info.path,
      path: path ?? {},
      query: query ?? {},
      body: body ?? null,
    };

    return runTwoPhase(ctx, {
      operations: [operationId],
      plan,
      confirmToken,
      renderPreview: (p) =>
        `Would ${(p["method"] as string).toUpperCase()} ${p["apiPath"] as string}` +
        ` (operationId=${p["operation"] as string}).`,
      execute: () =>
        ctx.client.call(operationId as OperationId, {
          ...(path !== undefined ? { path } : {}),
          ...(query !== undefined ? { query } : {}),
          ...(body !== undefined ? { body } : {}),
        }),
      renderSuccess: (p, result) => {
        const errorCode = (result as { errorCode?: number }).errorCode;
        if (errorCode !== undefined && errorCode !== 0) {
          return `${p["operation"] as string} FAILED: errorCode=${errorCode} msg=${(result as { msg?: string }).msg ?? "unknown"}`;
        }
        return `${(p["method"] as string).toUpperCase()} ${p["apiPath"] as string} executed.`;
      },
    });
  },
});
