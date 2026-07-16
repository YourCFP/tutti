import { act, render, screen } from "@testing-library/react";
import type { AgentActivityTurn } from "@tutti-os/agent-activity-core";
import { describe, expect, it, vi } from "vitest";
import type { AgentTranscriptRowVM } from "../contracts/agentTranscriptRowVM";
import type { AgentTranscriptTurnGroup } from "./agentTranscriptModel";
import { AgentTurnWorkSection } from "./AgentTurnWorkSection";
import type { AgentTurnDisclosureStore } from "./AgentTurnDisclosureContext";

vi.mock("../../../i18n/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../i18n/index")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        key === "agentHost.agentGui.turnProcessedSeconds"
          ? `Processed for ${String(options?.seconds)}s`
          : key
    })
  };
});

const disclosureStore: AgentTurnDisclosureStore = {
  expandedOverrides: {},
  setExpandedOverride: () => {}
};

describe("AgentTurnWorkSection", () => {
  it("ticks only the duration label without rerendering transcript rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    const renderRow = vi.fn((row: AgentTranscriptRowVM, rowIndex: number) => (
      <div key={`${row.id}:${rowIndex}`}>{row.id}</div>
    ));

    try {
      render(
        <AgentTurnWorkSection
          group={turnGroup()}
          sessionId="session-1"
          turn={canonicalTurn()}
          isActiveTurn
          disclosureStore={disclosureStore}
          renderRow={renderRow}
        />
      );

      expect(screen.getByText("Processed for 45s")).toBeTruthy();
      expect(vi.getTimerCount()).toBe(1);
      renderRow.mockClear();
      act(() => vi.advanceTimersByTime(5_000));
      expect(screen.getByText("Processed for 50s")).toBeTruthy();
      expect(renderRow).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start a live timer for a non-active canonical turn", () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);

    try {
      render(
        <AgentTurnWorkSection
          group={turnGroup()}
          sessionId="session-1"
          turn={canonicalTurn()}
          isActiveTurn={false}
          disclosureStore={disclosureStore}
          renderRow={(row, rowIndex) => (
            <div key={`${row.id}:${rowIndex}`}>{row.id}</div>
          )}
        />
      );

      expect(screen.queryByText(/Processed for/)).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the live timer and freezes timing when the turn settles", () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    const renderRow = (row: AgentTranscriptRowVM, rowIndex: number) => (
      <div key={`${row.id}:${rowIndex}`}>{row.id}</div>
    );

    try {
      const { rerender } = render(
        <AgentTurnWorkSection
          group={turnGroup()}
          sessionId="session-1"
          turn={canonicalTurn()}
          isActiveTurn
          disclosureStore={disclosureStore}
          renderRow={renderRow}
        />
      );
      expect(vi.getTimerCount()).toBe(1);

      rerender(
        <AgentTurnWorkSection
          group={turnGroup()}
          sessionId="session-1"
          turn={canonicalTurn({
            phase: "settled",
            outcome: "completed",
            settledAtUnixMs: 12_000
          })}
          isActiveTurn={false}
          disclosureStore={disclosureStore}
          renderRow={renderRow}
        />
      );

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

function canonicalTurn(
  overrides: Partial<AgentActivityTurn> = {}
): AgentActivityTurn {
  return {
    agentSessionId: "session-1",
    origin: "user_prompt",
    phase: "running",
    startedAtUnixMs: 5_000,
    turnId: "turn-1",
    updatedAtUnixMs: 6_000,
    ...overrides
  };
}

function turnGroup(): AgentTranscriptTurnGroup {
  const row: AgentTranscriptRowVM = {
    kind: "message",
    id: "user-row",
    turnId: "turn-1",
    speaker: "user",
    messages: [
      {
        kind: "message-content",
        id: "user-message",
        turnId: "turn-1",
        body: "Please fix it",
        presentationKind: "content",
        occurredAtUnixMs: 5_000
      }
    ],
    thinking: [],
    occurredAtUnixMs: 5_000
  };
  return {
    key: "turn-1",
    turnId: "turn-1",
    rows: [{ row, rowIndex: 0 }]
  };
}
