import { useMemo, type JSX, type ReactNode } from "react";
import type { AgentActivityTurn } from "@tutti-os/agent-activity-core";
import { BareIconButton } from "@tutti-os/ui-system/components";
import { ChevronDownIcon } from "@tutti-os/ui-system/icons";
import { useTranslation } from "../../../i18n/index";
import { CollapsibleReveal } from "./CollapsibleReveal";
import type { AgentTranscriptTurnGroup } from "./agentTranscriptModel";
import type { AgentTurnDisclosureStore } from "./AgentTurnDisclosureContext";
import { useElapsedSeconds } from "./useElapsedSeconds";
import {
  buildAgentTurnWorkSectionModel,
  formatAgentTurnDuration,
  type AgentTurnDuration,
  type AgentTurnTiming
} from "./agentTurnWorkSectionModel";

interface AgentTurnWorkSectionProps {
  group: AgentTranscriptTurnGroup;
  sessionId: string;
  turn: AgentActivityTurn | null;
  disclosureStore: AgentTurnDisclosureStore;
  renderRow: (
    row: AgentTranscriptTurnGroup["rows"][number]["row"],
    rowIndex: number
  ) => JSX.Element;
}

export function AgentTurnWorkSection({
  group,
  sessionId,
  turn,
  disclosureStore,
  renderRow
}: AgentTurnWorkSectionProps): JSX.Element {
  const { t } = useTranslation();
  const liveStartUnixMs =
    turn?.phase !== "settled" && Number.isFinite(turn?.startedAtUnixMs)
      ? (turn?.startedAtUnixMs ?? null)
      : null;
  const liveElapsedSeconds = useElapsedSeconds(liveStartUnixMs);
  const nowUnixMs =
    liveStartUnixMs !== null && liveElapsedSeconds !== null
      ? liveStartUnixMs + liveElapsedSeconds * 1_000
      : (turn?.settledAtUnixMs ?? 0);
  const model = useMemo(
    () => buildAgentTurnWorkSectionModel(group, turn, nowUnixMs),
    [group, nowUnixMs, turn]
  );
  const disclosureKey = `${sessionId}:${group.turnId ?? group.key}`;
  const expanded = model.collapseEligible
    ? (disclosureStore.expandedOverrides[disclosureKey] ?? false)
    : true;

  if (!model.timing) {
    return <>{renderRows(group.rows, renderRow)}</>;
  }

  const durationLabel = translateDuration(t, model.timing);
  const toggleLabel = expanded
    ? t("agentHost.agentGui.collapseTurnWork")
    : t("agentHost.agentGui.expandTurnWork");

  return (
    <>
      {renderRows(model.userRows, renderRow)}
      <div
        className="flex min-h-6 items-center gap-0.5 text-[12px] text-[var(--text-tertiary)]"
        data-agent-turn-work-header={group.turnId ?? group.key}
      >
        <span>{durationLabel}</span>
        {model.collapseEligible ? (
          <BareIconButton
            size="sm"
            aria-label={toggleLabel}
            aria-expanded={expanded}
            title={toggleLabel}
            onClick={() =>
              disclosureStore.setExpandedOverride(disclosureKey, !expanded)
            }
          >
            <ChevronDownIcon
              aria-hidden="true"
              className={`transition-transform duration-150 ${
                expanded ? "rotate-0" : "-rotate-90"
              }`}
            />
          </BareIconButton>
        ) : null}
      </div>
      {model.workRowsBeforeFinal.length > 0 ? (
        <CollapsibleReveal expanded={expanded}>
          {renderRows(model.workRowsBeforeFinal, renderRow)}
        </CollapsibleReveal>
      ) : null}
      {renderRows(model.finalRows, renderRow)}
      {model.workRowsAfterFinal.length > 0 ? (
        <CollapsibleReveal expanded={expanded}>
          {renderRows(model.workRowsAfterFinal, renderRow)}
        </CollapsibleReveal>
      ) : null}
    </>
  );
}

function renderRows(
  rows: readonly AgentTranscriptTurnGroup["rows"][number][],
  renderRow: AgentTurnWorkSectionProps["renderRow"]
): ReactNode {
  return rows.map(({ row, rowIndex }) => renderRow(row, rowIndex));
}

function translateDuration(
  t: ReturnType<typeof useTranslation>["t"],
  timing: AgentTurnTiming
): string {
  const duration = formatAgentTurnDuration(timing.elapsedSeconds);
  return timing.kind === "live"
    ? translateLiveDuration(t, duration)
    : translateSettledDuration(t, duration);
}

function translateLiveDuration(
  t: ReturnType<typeof useTranslation>["t"],
  duration: AgentTurnDuration
): string {
  if (duration.kind === "seconds") {
    return t("agentHost.agentGui.turnProcessedSeconds", {
      seconds: duration.seconds
    });
  }
  if (duration.kind === "minutes") {
    return t("agentHost.agentGui.turnProcessedMinutes", {
      minutes: duration.minutes
    });
  }
  return t("agentHost.agentGui.turnProcessedMinutesSeconds", {
    minutes: duration.minutes,
    seconds: duration.seconds
  });
}

function translateSettledDuration(
  t: ReturnType<typeof useTranslation>["t"],
  duration: AgentTurnDuration
): string {
  if (duration.kind === "seconds") {
    return t("agentHost.agentGui.turnTotalSeconds", {
      seconds: duration.seconds
    });
  }
  if (duration.kind === "minutes") {
    return t("agentHost.agentGui.turnTotalMinutes", {
      minutes: duration.minutes
    });
  }
  return t("agentHost.agentGui.turnTotalMinutesSeconds", {
    minutes: duration.minutes,
    seconds: duration.seconds
  });
}
