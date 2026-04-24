import { ToolRegistry } from "../registry.js";
import { omadaClientJourneyTool } from "./inventory/client_journey.js";
import { omadaDeviceDetailTool } from "./inventory/device_detail.js";
import { omadaListClientsTool } from "./inventory/list_clients.js";
import { omadaListDevicesTool } from "./inventory/list_devices.js";
import { omadaSiteOverviewTool } from "./monitor/site_overview.js";
import { omadaDiscoverScopeTool } from "./scope/discover_scope.js";
import { omadaListSitesTool } from "./scope/list_sites.js";

export { omadaClientJourneyTool } from "./inventory/client_journey.js";
export { omadaDeviceDetailTool } from "./inventory/device_detail.js";
export { omadaListClientsTool } from "./inventory/list_clients.js";
export { omadaListDevicesTool } from "./inventory/list_devices.js";
export { omadaSiteOverviewTool } from "./monitor/site_overview.js";
export { omadaDiscoverScopeTool } from "./scope/discover_scope.js";
export { omadaListSitesTool } from "./scope/list_sites.js";

/**
 * Build the default registry that the MCP server exposes. Tools are added
 * in the order the team wants them shown to clients that do not implement
 * tool-search yet.
 */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(omadaDiscoverScopeTool);
  registry.register(omadaListSitesTool);
  registry.register(omadaSiteOverviewTool);
  registry.register(omadaListDevicesTool);
  registry.register(omadaDeviceDetailTool);
  registry.register(omadaListClientsTool);
  registry.register(omadaClientJourneyTool);
  return registry;
}
