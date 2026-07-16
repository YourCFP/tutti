const AGENT_TURN_DISCLOSURE_SCROLL_LOG_PREFIX =
  "[agent-gui][turn-disclosure-scroll]";
const AGENT_TURN_DISCLOSURE_DIAGNOSTIC_ATTRIBUTE =
  "data-agent-turn-disclosure-diagnostic";
const AGENT_TURN_DISCLOSURE_PENDING_REVEALS_ATTRIBUTE =
  "data-agent-turn-disclosure-pending-reveals";

interface AgentTurnDisclosureDiagnosticDetails {
  [key: string]: unknown;
}

export function beginAgentTurnDisclosureDiagnostic(
  source: Element,
  disclosureId: string,
  details: AgentTurnDisclosureDiagnosticDetails,
  expectedRevealTransitions = 1
): void {
  const timeline = findAgentTimeline(source);
  if (!timeline) {
    return;
  }
  timeline.setAttribute(
    AGENT_TURN_DISCLOSURE_DIAGNOSTIC_ATTRIBUTE,
    disclosureId
  );
  timeline.setAttribute(
    AGENT_TURN_DISCLOSURE_PENDING_REVEALS_ATTRIBUTE,
    String(Math.max(1, expectedRevealTransitions))
  );
  logAgentTurnDisclosureTimeline(timeline, "toggle", {
    ...details,
    expectedRevealTransitions: Math.max(1, expectedRevealTransitions)
  });
}

export function finishAgentTurnDisclosureDiagnostic(
  source: Element,
  disclosureId: string,
  event: string,
  details: AgentTurnDisclosureDiagnosticDetails
): void {
  const timeline = findAgentTimeline(source);
  if (
    !timeline ||
    readAgentTurnDisclosureDiagnosticId(timeline) !== disclosureId
  ) {
    return;
  }
  const pendingRevealTransitions = Number(
    timeline.getAttribute(AGENT_TURN_DISCLOSURE_PENDING_REVEALS_ATTRIBUTE)
  );
  const remainingRevealTransitions = Math.max(
    0,
    (Number.isFinite(pendingRevealTransitions) ? pendingRevealTransitions : 1) -
      1
  );
  logAgentTurnDisclosureTimeline(timeline, event, {
    ...details,
    pendingRevealTransitions,
    remainingRevealTransitions
  });
  if (remainingRevealTransitions > 0) {
    timeline.setAttribute(
      AGENT_TURN_DISCLOSURE_PENDING_REVEALS_ATTRIBUTE,
      String(remainingRevealTransitions)
    );
    return;
  }
  timeline.removeAttribute(AGENT_TURN_DISCLOSURE_DIAGNOSTIC_ATTRIBUTE);
  timeline.removeAttribute(AGENT_TURN_DISCLOSURE_PENDING_REVEALS_ATTRIBUTE);
}

export function logActiveAgentTurnDisclosureFromElement(
  source: Element,
  event: string,
  details: AgentTurnDisclosureDiagnosticDetails
): void {
  const timeline = findAgentTimeline(source);
  if (!timeline) {
    return;
  }
  logAgentTurnDisclosureTimeline(timeline, event, details);
}

export function logAgentTurnDisclosureTimeline(
  timeline: HTMLElement,
  event: string,
  details: AgentTurnDisclosureDiagnosticDetails
): void {
  const disclosureId = readAgentTurnDisclosureDiagnosticId(timeline);
  if (!disclosureId) {
    return;
  }
  const maxScrollTop = Math.max(
    0,
    timeline.scrollHeight - timeline.clientHeight
  );
  console.info(
    AGENT_TURN_DISCLOSURE_SCROLL_LOG_PREFIX,
    JSON.stringify({
      event,
      atUnixMs: Date.now(),
      disclosureId,
      timeline: {
        scrollTop: timeline.scrollTop,
        scrollHeight: timeline.scrollHeight,
        clientHeight: timeline.clientHeight,
        maxScrollTop,
        distanceFromBottom: maxScrollTop - timeline.scrollTop,
        virtualized:
          timeline.querySelector(
            '[data-agent-transcript-virtualized="true"]'
          ) !== null
      },
      details
    })
  );
}

function findAgentTimeline(source: Element): HTMLElement | null {
  return source.closest<HTMLElement>('[data-testid="agent-gui-timeline"]');
}

function readAgentTurnDisclosureDiagnosticId(
  timeline: HTMLElement
): string | null {
  return timeline.getAttribute(AGENT_TURN_DISCLOSURE_DIAGNOSTIC_ATTRIBUTE);
}
