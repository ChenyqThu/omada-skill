import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  omadacId: z.string().min(1).describe("Omada Controller ID (tenant)."),
  siteId: z.string().min(1).describe("Site ID to list devices for. Discover via omada_list_sites."),
});

export const omadaListDevicesTool = defineTool({
  name: "omada_list_devices",
  title: "List devices in an Omada site",
  description:
    "List APs / switches / gateways / stacks adopted by one site. Returns a unified " +
    "summary grouped by kind plus the raw device array in structuredContent. Use " +
    "this to discover MACs / serials before calling omada_device_detail or " +
    "omada_device_action.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { omadacId, siteId } = input;
    ctx.logger.debug("omada_list_devices", { omadacId, siteId });

    const response = await ctx.client.call("getAllDeviceBySite", {
      path: { omadacId, siteId },
    });

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

    const devices = (response.result ?? []) as DeviceRow[];
    return textResult(formatDevices(devices, siteId), {
      siteId,
      count: devices.length,
      devices,
    });
  },
});

interface DeviceRow {
  mac?: string;
  name?: string;
  model?: string;
  type?: string;
  status?: number | string;
  statusCategory?: number | string;
  ip?: string;
  firmwareVersion?: string;
  [key: string]: unknown;
}

function formatDevices(rows: DeviceRow[], siteId: string): string {
  if (rows.length === 0) {
    return `No devices found in site ${siteId}.`;
  }
  const byKind = new Map<string, DeviceRow[]>();
  for (const d of rows) {
    const kind = (d.type ?? "unknown").toString();
    const bucket = byKind.get(kind) ?? [];
    bucket.push(d);
    byKind.set(kind, bucket);
  }
  const header = `Found ${rows.length} device(s) in site ${siteId}:`;
  const sections: string[] = [];
  for (const [kind, group] of [...byKind.entries()].sort()) {
    sections.push(`  ${kind} (${group.length}):`);
    for (const d of group.slice(0, 20)) {
      const name = d.name ?? "(unnamed)";
      const mac = d.mac ?? "(no-mac)";
      const model = d.model ? ` · ${d.model}` : "";
      const ip = d.ip ? ` · ${d.ip}` : "";
      const status = describeStatus(d.status);
      sections.push(`    • ${name} — mac=${mac}${model}${ip} · ${status}`);
    }
    if (group.length > 20) {
      sections.push(`    … ${group.length - 20} more of this kind omitted.`);
    }
  }
  return [header, ...sections].join("\n");
}

function describeStatus(status: unknown): string {
  if (typeof status === "string") return status;
  // Omada status codes: roughly 0=disconnected, 1=provisioning, 2=configuring,
  // 10=connected, 11=upgrading. We don't need full fidelity, just a hint.
  switch (status) {
    case 0:
      return "disconnected";
    case 10:
    case 11:
      return "connected";
    default:
      return status === undefined ? "unknown" : `status=${String(status)}`;
  }
}
