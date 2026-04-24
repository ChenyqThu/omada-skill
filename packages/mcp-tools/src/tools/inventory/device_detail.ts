import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";
import type { ToolContext } from "../../types.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID the device belongs to."),
  kind: z
    .enum(["ap", "switch", "gateway", "stack"])
    .describe("Device kind — determines which detail endpoint is called."),
  id: z
    .string()
    .min(1)
    .describe(
      "Device identifier: MAC for ap/switch/gateway, stackId for stack. " +
        "Use omada_list_devices to discover.",
    ),
});

export const omadaDeviceDetailTool = defineTool({
  name: "omada_device_detail",
  title: "Omada device detail",
  description:
    "Fetch a device's full inventory + health record. Routes on `kind` to the " +
    "correct endpoint — AP (getOverviewDetail), switch (getSwitchInfo), gateway " +
    "(getGatewayInfo_1), or stack (getOswStackDetail). Returns a compact status " +
    "summary plus the raw payload in structuredContent.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId, kind, id } = input;
    ctx.logger.debug("omada_device_detail", { omadacId, siteId, kind, id });

    const response = await callByKind(kind, id, omadacId, siteId, ctx);
    if (!response || (response.errorCode !== undefined && response.errorCode !== 0)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Omada API returned errorCode=${response?.errorCode} msg=${response?.msg ?? "unknown"}`,
          },
        ],
      };
    }

    const detail = (response.result ?? {}) as DeviceDetail;
    return textResult(format(detail, kind, id), { kind, id, detail });
  },
});

async function callByKind(
  kind: z.infer<typeof InputSchema>["kind"],
  id: string,
  omadacId: string,
  siteId: string,
  ctx: ToolContext,
): Promise<{ errorCode?: number; msg?: string; result?: unknown }> {
  switch (kind) {
    case "ap":
      return ctx.client.call("getOverviewDetail", {
        path: { omadacId, siteId, apMac: id },
      });
    case "switch":
      return ctx.client.call("getSwitchInfo", {
        path: { omadacId, siteId, switchMac: id },
      });
    case "gateway":
      return ctx.client.call("getGatewayInfo_1", {
        path: { omadacId, siteId, gatewayMac: id },
      });
    case "stack":
      return ctx.client.call("getOswStackDetail", {
        path: { omadacId, siteId, stackId: id },
      });
  }
}

interface DeviceDetail {
  name?: string;
  mac?: string;
  model?: string;
  firmwareVersion?: string;
  ip?: string;
  uptimeLong?: number;
  uptimeStr?: string;
  status?: number | string;
  cpuUtil?: number;
  memUtil?: number;
  clients?: number;
  portsUsed?: number;
  ports?: unknown[];
  radios?: unknown[];
  [key: string]: unknown;
}

function format(detail: DeviceDetail, kind: string, id: string): string {
  const name = detail.name ?? "(unnamed)";
  const model = detail.model ? ` · ${detail.model}` : "";
  const fw = detail.firmwareVersion ? ` · fw ${detail.firmwareVersion}` : "";
  const ip = detail.ip ? ` · ${detail.ip}` : "";
  const header = `${kind} ${name} (${id})${model}${fw}${ip}`;

  const healthParts: string[] = [];
  if (detail.uptimeStr ?? detail.uptimeLong !== undefined) {
    healthParts.push(`uptime=${detail.uptimeStr ?? detail.uptimeLong}`);
  }
  if (detail.cpuUtil !== undefined) healthParts.push(`cpu=${detail.cpuUtil}%`);
  if (detail.memUtil !== undefined) healthParts.push(`mem=${detail.memUtil}%`);
  if (detail.clients !== undefined) healthParts.push(`clients=${detail.clients}`);
  if (detail.portsUsed !== undefined) healthParts.push(`portsUsed=${detail.portsUsed}`);
  const healthLine = healthParts.length ? `  ${healthParts.join(" · ")}` : "";

  const radios = Array.isArray(detail.radios) ? detail.radios.length : 0;
  const ports = Array.isArray(detail.ports) ? detail.ports.length : 0;
  const shape = (radios > 0 ? `  Radios: ${radios}` : "") + (ports > 0 ? `  Ports: ${ports}` : "");

  return [header, healthLine, shape].filter(Boolean).join("\n");
}
