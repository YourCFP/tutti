/**
 * Codex has no provider-driven exit-plan approval flow (unlike claude-code's
 * ExitPlanMode tool): the official TUI offers a local "implement this plan?"
 * prompt after a plan-mode turn completes and submits a literal coding
 * message in default mode. This mirrors that contract for the GUI.
 * See codex-rs/tui/src/chatwidget/plan_implementation.rs.
 */
export const PLAN_IMPLEMENTATION_PROMPT = "Implement the plan.";

export function shouldOfferPlanImplementation(input: {
  provider: string;
  previousStatus: string | null;
  status: string | null;
  planModeActive: boolean;
  planItemProduced: boolean;
}): boolean {
  return (
    input.provider === "codex" &&
    input.planModeActive &&
    input.planItemProduced &&
    input.previousStatus === "working" &&
    input.status === "ready"
  );
}
