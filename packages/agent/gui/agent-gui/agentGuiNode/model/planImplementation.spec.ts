import { describe, expect, it } from "vitest";
import {
  PLAN_IMPLEMENTATION_PROMPT,
  latestPlanTurnId
} from "./planImplementation";

describe("latestPlanTurnId", () => {
  it("returns the turn id when the latest turn produced a plan item", () => {
    expect(
      latestPlanTurnId([
        { turnId: "turn-1", occurredAtUnixMs: 1, payload: {} },
        {
          turnId: "turn-1",
          occurredAtUnixMs: 2,
          payload: { messageKind: "plan" }
        }
      ])
    ).toBe("turn-1");
  });

  it("returns null when the latest turn has no plan item", () => {
    expect(
      latestPlanTurnId([
        {
          turnId: "turn-1",
          occurredAtUnixMs: 1,
          payload: { messageKind: "plan" }
        },
        { turnId: "turn-2", occurredAtUnixMs: 2, payload: {} }
      ])
    ).toBeNull();
  });

  it("ignores plan items that are not in the latest turn", () => {
    expect(
      latestPlanTurnId([
        {
          turnId: "turn-1",
          occurredAtUnixMs: 5,
          payload: { messageKind: "plan" }
        },
        { turnId: "turn-2", occurredAtUnixMs: 9, payload: {} }
      ])
    ).toBeNull();
  });

  it("returns null without any timeline items", () => {
    expect(latestPlanTurnId([])).toBeNull();
  });

  it("submits the same literal message as the codex TUI", () => {
    expect(PLAN_IMPLEMENTATION_PROMPT).toBe("Implement the plan.");
  });
});
