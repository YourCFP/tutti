import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginAgentTurnDisclosureDiagnostic,
  finishAgentTurnDisclosureDiagnostic,
  logAgentTurnDisclosureTimeline
} from "./agentTurnDisclosureDiagnostics";

describe("agent turn disclosure diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("logs one JSON payload under a stable prefix while disclosure tracing is active", () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const timeline = document.createElement("div");
    timeline.setAttribute("data-testid", "agent-gui-timeline");
    const button = document.createElement("button");
    const reveal = document.createElement("div");
    timeline.append(button, reveal);
    document.body.append(timeline);
    Object.defineProperties(timeline, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, writable: true, value: 580 }
    });

    beginAgentTurnDisclosureDiagnostic(
      button,
      "session-1:turn-1",
      {
        fromExpanded: true,
        toExpanded: false
      },
      2
    );
    logAgentTurnDisclosureTimeline(timeline, "timeline-scroll-capture", {
      correction: "bottom-lock"
    });
    finishAgentTurnDisclosureDiagnostic(
      reveal,
      "session-1:turn-1",
      "reveal-transition-end",
      { finalHeight: 0 }
    );
    logAgentTurnDisclosureTimeline(timeline, "between-reveals", {});
    finishAgentTurnDisclosureDiagnostic(
      reveal,
      "session-1:turn-1",
      "reveal-transition-end",
      { finalHeight: 0 }
    );
    logAgentTurnDisclosureTimeline(timeline, "ignored-after-finish", {});

    expect(consoleInfo).toHaveBeenCalledTimes(5);
    for (const [prefix, serializedPayload] of consoleInfo.mock.calls) {
      expect(prefix).toBe("[agent-gui][turn-disclosure-scroll]");
      expect(() => JSON.parse(String(serializedPayload))).not.toThrow();
    }
    expect(JSON.parse(String(consoleInfo.mock.calls[1]?.[1]))).toMatchObject({
      event: "timeline-scroll-capture",
      disclosureId: "session-1:turn-1",
      timeline: {
        scrollTop: 580,
        maxScrollTop: 600,
        distanceFromBottom: 20
      },
      details: { correction: "bottom-lock" }
    });
  });
});
