/**
 * High-risk Omada operations — irreversible, service-disrupting, or with
 * broad blast radius. Every MCP write tool MUST fail closed if a caller
 * wires up one of these operationIds without an explicit confirm_token
 * handshake (see confirmToken.ts).
 *
 * The exact operationIds are verified against the generated operations
 * map at test time; mismatches bubble up as failing tests so this list
 * cannot silently drift from the API spec.
 */
export const HIGH_RISK_OPERATION_IDS: ReadonlySet<string> = new Set([
  // Destruction / config rewrite
  "deleteSite",
  "deleteSiteTemplate",

  // Forceful device lifecycle
  "forgetDevice",
  "rebootDevice",
  "factoryReset",

  // Stack operations — entire stack goes offline
  "rebootMlag",
  "forceProvisionStack",
  "forgetStack",

  // Firmware — has downtime potential, even if staged
  "onlineRollingUpgrade",
  "ispUpgradeGateway",

  // Batch wrapper — can chain arbitrary writes, so blast radius is unbounded
  "batchController",
]);

export function isHighRiskOperation(operationId: string): boolean {
  return HIGH_RISK_OPERATION_IDS.has(operationId);
}

/**
 * Severity tiers help MCP tools decide how aggressive the confirmation
 * UX should be. A tool calling multiple operations can bubble up the
 * highest severity across its calls.
 */
export type RiskSeverity = "catastrophic" | "high" | "medium" | "low";

const SEVERITY: Record<string, RiskSeverity> = {
  deleteSite: "catastrophic",
  factoryReset: "catastrophic",
  forgetStack: "catastrophic",
  forceProvisionStack: "catastrophic",

  onlineRollingUpgrade: "high",
  ispUpgradeGateway: "high",
  rebootMlag: "high",

  forgetDevice: "medium",
  rebootDevice: "medium",
  deleteSiteTemplate: "medium",

  // The batch wrapper chains arbitrary writes — treat as high unless the
  // wrapping tool itself downgrades after inspecting the action list.
  batchController: "high",
};

export function riskSeverity(operationId: string): RiskSeverity {
  return SEVERITY[operationId] ?? (isHighRiskOperation(operationId) ? "medium" : "low");
}
