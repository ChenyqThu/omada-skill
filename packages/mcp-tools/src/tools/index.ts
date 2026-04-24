import { ToolRegistry } from "../registry.js";
import { omadaClientJourneyTool } from "./inventory/client_journey.js";
import { omadaDeviceDetailTool } from "./inventory/device_detail.js";
import { omadaListClientsTool } from "./inventory/list_clients.js";
import { omadaListDevicesTool } from "./inventory/list_devices.js";
import { omadaAlertsListTool } from "./monitor/alerts_list.js";
import { omadaAlertsTriageTool } from "./monitor/alerts_triage.js";
import { omadaApplySiteTemplateTool } from "./deploy/apply_site_template.js";
import { omadaBulkOnboardTool } from "./deploy/bulk_onboard.js";
import { omadaPortalWizardTool } from "./deploy/portal_wizard.js";
import { omadaBatchChangeTool } from "./lifecycle/batch_change.js";
import { omadaDeviceActionTool } from "./lifecycle/device_action.js";
import { omadaFirmwareRolloutTool } from "./lifecycle/firmware_rollout.js";
import { omadaAuditLogsTool } from "./monitor/audit_logs.js";
import { omadaExecReportTool } from "./monitor/exec_report.js";
import { omadaFirmwarePlanTool } from "./monitor/firmware_plan.js";
import { omadaSiteOverviewTool } from "./monitor/site_overview.js";
import { omadaTopologyTool } from "./monitor/topology.js";
import { omadaVoipOverviewTool } from "./monitor/voip_overview.js";
import { omadaVpnStatusTool } from "./monitor/vpn_status.js";
import { omadaWifiDiagnoseTool } from "./monitor/wifi_diagnose.js";
import { omadaDiscoverScopeTool } from "./scope/discover_scope.js";
import { omadaListSitesTool } from "./scope/list_sites.js";

export { omadaClientJourneyTool } from "./inventory/client_journey.js";
export { omadaDeviceDetailTool } from "./inventory/device_detail.js";
export { omadaListClientsTool } from "./inventory/list_clients.js";
export { omadaListDevicesTool } from "./inventory/list_devices.js";
export { omadaAlertsListTool } from "./monitor/alerts_list.js";
export { omadaAlertsTriageTool } from "./monitor/alerts_triage.js";
export { omadaApplySiteTemplateTool } from "./deploy/apply_site_template.js";
export { omadaBulkOnboardTool } from "./deploy/bulk_onboard.js";
export { omadaPortalWizardTool } from "./deploy/portal_wizard.js";
export { omadaBatchChangeTool } from "./lifecycle/batch_change.js";
export { omadaDeviceActionTool } from "./lifecycle/device_action.js";
export { omadaFirmwareRolloutTool } from "./lifecycle/firmware_rollout.js";
export { omadaAuditLogsTool } from "./monitor/audit_logs.js";
export { omadaExecReportTool } from "./monitor/exec_report.js";
export { omadaFirmwarePlanTool } from "./monitor/firmware_plan.js";
export { omadaSiteOverviewTool } from "./monitor/site_overview.js";
export { omadaTopologyTool } from "./monitor/topology.js";
export { omadaVoipOverviewTool } from "./monitor/voip_overview.js";
export { omadaVpnStatusTool } from "./monitor/vpn_status.js";
export { omadaWifiDiagnoseTool } from "./monitor/wifi_diagnose.js";
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
  registry.register(omadaAlertsListTool);
  registry.register(omadaAlertsTriageTool);
  registry.register(omadaTopologyTool);
  registry.register(omadaWifiDiagnoseTool);
  registry.register(omadaVoipOverviewTool);
  registry.register(omadaVpnStatusTool);
  registry.register(omadaAuditLogsTool);
  registry.register(omadaFirmwarePlanTool);
  registry.register(omadaExecReportTool);
  registry.register(omadaApplySiteTemplateTool);
  registry.register(omadaBulkOnboardTool);
  registry.register(omadaPortalWizardTool);
  registry.register(omadaDeviceActionTool);
  registry.register(omadaFirmwareRolloutTool);
  registry.register(omadaBatchChangeTool);
  return registry;
}
