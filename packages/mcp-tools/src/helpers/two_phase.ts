import {
  isHighRiskOperation,
  issueConfirmToken,
  riskSeverity,
  verifyConfirmToken,
} from "@omada/guardrails";

import { textResult } from "../registry.js";
import type { ToolContext, ToolResult } from "../types.js";

export interface TwoPhaseRequest<Plan extends Record<string, unknown>, Result> {
  /** Operation IDs the tool will invoke. Used for the whitelist + severity check. */
  operations: string[];
  /** The plan fingerprinted for the confirm token (must be serializable / stable). */
  plan: Plan;
  /** Token supplied by the caller on the second phase, if any. */
  confirmToken: string | undefined;
  /** Human-readable preview rendered when confirmation is required. */
  renderPreview: (plan: Plan) => string;
  /** Actual execution — only invoked on phase 2 with a valid token. */
  execute: () => Promise<Result>;
  /** Human-readable summary rendered once execution succeeds. */
  renderSuccess: (plan: Plan, result: Result) => string;
}

/**
 * Two-phase commit helper for write tools.
 *
 * Phase 1: caller omits confirm_token → we issue a deterministic token for the
 * computed plan and return a preview result. `isError` stays unset so Claude
 * surfaces the preview naturally.
 * Phase 2: caller re-invokes the tool with the same input plus `confirm_token`
 * matching the plan. We verify + execute. Mismatched tokens or plan drift are
 * rejected as `isError: true`.
 *
 * High-risk operations (`isHighRiskOperation`) always require the handshake —
 * there is no short-circuit path for "tool forgot to protect its write".
 */
export async function runTwoPhase<Plan extends Record<string, unknown>, Result>(
  ctx: ToolContext,
  req: TwoPhaseRequest<Plan, Result>,
): Promise<ToolResult> {
  const topSeverity = req.operations.reduce<"catastrophic" | "high" | "medium" | "low">(
    (cur, op) => {
      const next = riskSeverity(op);
      return ordinal(next) < ordinal(cur) ? next : cur;
    },
    "low",
  );
  const highRisk = req.operations.some(isHighRiskOperation);

  const token = req.confirmToken ?? ctx.confirmToken;
  if (token === undefined) {
    // Phase 1 — plan + issue a token + surface the preview.
    const newToken = issueConfirmToken(req.plan);
    const preview = `[confirm required · severity=${topSeverity}${highRisk ? " · HIGH-RISK" : ""}]\n${req.renderPreview(req.plan)}\n\nTo execute, re-invoke this tool with confirm_token=${newToken}.`;
    return textResult(preview, {
      phase: "preview",
      confirmToken: newToken,
      severity: topSeverity,
      highRisk,
      operations: req.operations,
      plan: req.plan,
    });
  }

  if (!verifyConfirmToken(req.plan, token)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            "confirm_token does not match the current plan. Either the plan has changed " +
            "or the token expired. Re-invoke the tool WITHOUT confirm_token to generate " +
            "a fresh preview.",
        },
      ],
    };
  }

  try {
    const result = await req.execute();
    return textResult(req.renderSuccess(req.plan, result), {
      phase: "executed",
      severity: topSeverity,
      highRisk,
      operations: req.operations,
      plan: req.plan,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: "text", text: `Execution failed: ${message}` }],
    };
  }
}

function ordinal(sev: "catastrophic" | "high" | "medium" | "low"): number {
  switch (sev) {
    case "catastrophic":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
  }
}
