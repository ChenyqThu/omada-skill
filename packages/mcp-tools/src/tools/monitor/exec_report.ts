import { z } from "zod";

import { defineTool, textResult } from "../../registry.js";

const InputSchema = z.object({
  mspId: z.string().min(1).describe("MSP tenant ID to compile the report for."),
});

export const omadaExecReportTool = defineTool({
  name: "omada_exec_report",
  title: "Omada cross-site exec report",
  description:
    "MSP cross-site KPI report. Calls getMspDashboardOverall and renders a " +
    "compact summary (device / client totals, alert counts) suitable for a " +
    "weekly ops digest. Read-only. Requires MSP scope — single-tenant " +
    "operators should use omada_site_overview instead.",
  inputSchema: InputSchema,
  handler: async (input, ctx) => {
    const { mspId } = input;
    ctx.logger.debug("omada_exec_report", { mspId });

    const response = await ctx.client.call("getMspDashboardOverall", {
      path: { mspId },
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

    const dash = (response.result ?? {}) as MspDashboard;
    return textResult(format(dash, mspId), { mspId, dashboard: dash });
  },
});

interface MspDashboard {
  customerTotal?: number;
  siteTotal?: number;
  deviceTotal?: number;
  deviceConnectedTotal?: number;
  clientTotal?: number;
  wirelessClientTotal?: number;
  guestTotal?: number;
  deviceAlertsTotal?: number;
  criticalAlertTotal?: number;
  [key: string]: unknown;
}

function format(d: MspDashboard, mspId: string): string {
  const lines = [`Exec report · MSP ${mspId}`];
  const scope: string[] = [];
  if (d.customerTotal !== undefined) scope.push(`customers=${d.customerTotal}`);
  if (d.siteTotal !== undefined) scope.push(`sites=${d.siteTotal}`);
  if (scope.length) lines.push(`  Scope: ${scope.join(" · ")}`);

  const devices: string[] = [];
  if (d.deviceTotal !== undefined) devices.push(`total=${d.deviceTotal}`);
  if (d.deviceConnectedTotal !== undefined) devices.push(`connected=${d.deviceConnectedTotal}`);
  if (devices.length) lines.push(`  Devices: ${devices.join(" · ")}`);

  const clients: string[] = [];
  if (d.clientTotal !== undefined) clients.push(`total=${d.clientTotal}`);
  if (d.wirelessClientTotal !== undefined) clients.push(`wireless=${d.wirelessClientTotal}`);
  if (d.guestTotal !== undefined) clients.push(`guests=${d.guestTotal}`);
  if (clients.length) lines.push(`  Clients: ${clients.join(" · ")}`);

  const alerts: string[] = [];
  if (d.criticalAlertTotal !== undefined) alerts.push(`critical=${d.criticalAlertTotal}`);
  if (d.deviceAlertsTotal !== undefined) alerts.push(`device=${d.deviceAlertsTotal}`);
  if (alerts.length) lines.push(`  Alerts: ${alerts.join(" · ")}`);

  if (lines.length === 1) lines.push("  (dashboard returned empty — check MSP-mode scope)");
  return lines.join("\n");
}
