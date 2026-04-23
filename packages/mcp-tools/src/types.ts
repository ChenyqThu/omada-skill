import type { OmadaClient } from "@omada/sdk";
import type { Logger } from "@omada/shared";
import type { z } from "zod";

export interface ToolContext {
  client: OmadaClient;
  logger: Logger;
  /** If true, tools MUST NOT perform writes and should return a plan preview. */
  dryRun?: boolean;
  /** Opaque token from the caller to confirm a previously-planned write. */
  confirmToken?: string;
}

export interface TextContent {
  type: "text";
  text: string;
}

/** Mirrors MCP 2025-06 `CallToolResult`. */
export interface ToolResult {
  content: TextContent[];
  isError?: boolean;
  structuredContent?: unknown;
}

/**
 * Tool metadata exposed through MCP tools/list. `inputSchema` carries the
 * JSON Schema the registry derived from the tool's zod schema; the full
 * zod object is kept in `zodSchema` for in-process validation.
 */
export interface ToolDescriptor {
  name: string;
  title?: string;
  description: string;
  inputSchema: unknown;
}

export interface ToolDefinition extends ToolDescriptor {
  zodSchema: z.ZodTypeAny;
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}
