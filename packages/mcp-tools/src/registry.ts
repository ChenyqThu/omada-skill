import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type {
  TextContent,
  ToolContext,
  ToolDefinition,
  ToolDescriptor,
  ToolResult,
} from "./types.js";

export interface DefineToolInput<S extends z.ZodTypeAny> {
  name: string;
  title?: string;
  description: string;
  inputSchema: S;
  handler: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>;
}

/**
 * Defines a tool with strong typing on its handler. Input is validated with
 * zod at call time; validation errors are returned as `isError: true` tool
 * results (MCP convention) rather than thrown.
 */
export function defineTool<S extends z.ZodTypeAny>(def: DefineToolInput<S>): ToolDefinition {
  const jsonSchema = zodToJsonSchema(def.inputSchema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  });
  const descriptor: ToolDescriptor = {
    name: def.name,
    description: def.description,
    inputSchema: jsonSchema,
    ...(def.title !== undefined ? { title: def.title } : {}),
  };
  return {
    ...descriptor,
    zodSchema: def.inputSchema,
    handler: async (input, ctx) => {
      const parsed = def.inputSchema.safeParse(input);
      if (!parsed.success) {
        return errorResult(
          `Invalid input for tool "${def.name}":\n${parsed.error.issues
            .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n")}`,
        );
      }
      return def.handler(parsed.data, ctx);
    },
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()].map(({ zodSchema: _z, handler: _h, ...d }) => d);
  }

  async call(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return errorResult(`Unknown tool: "${name}"`);
    }
    try {
      return await tool.handler(input, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.logger.error("tool handler threw", { tool: name, message });
      return errorResult(`Tool "${name}" failed: ${message}`);
    }
  }

  get size(): number {
    return this.tools.size;
  }
}

export function textResult(text: string, structured?: unknown): ToolResult {
  const content: TextContent[] = [{ type: "text", text }];
  return {
    content,
    ...(structured !== undefined ? { structuredContent: structured } : {}),
  };
}

export function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}
