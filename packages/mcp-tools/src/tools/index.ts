import { ToolRegistry } from "../registry.js";
import { omadaListClientsTool } from "./inventory/list_clients.js";
import { omadaListDevicesTool } from "./inventory/list_devices.js";
import { omadaDiscoverScopeTool } from "./scope/discover_scope.js";
import { omadaListSitesTool } from "./scope/list_sites.js";

export { omadaListClientsTool } from "./inventory/list_clients.js";
export { omadaListDevicesTool } from "./inventory/list_devices.js";
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
  registry.register(omadaListDevicesTool);
  registry.register(omadaListClientsTool);
  return registry;
}
