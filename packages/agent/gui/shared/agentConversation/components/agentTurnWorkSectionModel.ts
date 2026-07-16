import type { AgentActivityTurn } from "@tutti-os/agent-activity-core";
import type {
  AgentMessageContentVM,
  AgentMessageRowVM
} from "../contracts/agentMessageRowVM";
import type { AgentTranscriptTurnGroup } from "./agentTranscriptModel";

export type AgentTurnTiming = {
  kind: "live" | "settled";
  elapsedSeconds: number;
};

export type AgentTurnDuration =
  | { kind: "seconds"; seconds: number }
  | { kind: "minutes"; minutes: number }
  | { kind: "minutes-seconds"; minutes: number; seconds: number };

type AgentTranscriptTurnRow = AgentTranscriptTurnGroup["rows"][number];

export interface AgentTurnWorkSectionModel {
  timing: AgentTurnTiming | null;
  userRows: AgentTranscriptTurnRow[];
  workRowsBeforeFinal: AgentTranscriptTurnRow[];
  finalRows: AgentTranscriptTurnRow[];
  workRowsAfterFinal: AgentTranscriptTurnRow[];
  collapseEligible: boolean;
}

export function resolveAgentTurnTiming(
  turn: AgentActivityTurn | null | undefined,
  nowUnixMs: number
): AgentTurnTiming | null {
  if (!turn || !Number.isFinite(turn.startedAtUnixMs)) {
    return null;
  }

  const kind = turn.phase === "settled" ? "settled" : "live";
  const endUnixMs = kind === "settled" ? turn.settledAtUnixMs : nowUnixMs;
  if (
    !Number.isFinite(endUnixMs) ||
    (endUnixMs as number) < turn.startedAtUnixMs
  ) {
    return null;
  }

  return {
    kind,
    elapsedSeconds: Math.max(
      0,
      Math.floor(((endUnixMs as number) - turn.startedAtUnixMs) / 1_000)
    )
  };
}

export function formatAgentTurnDuration(
  elapsedSeconds: number
): AgentTurnDuration {
  const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  if (safeSeconds < 60) {
    return { kind: "seconds", seconds: safeSeconds };
  }

  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (seconds === 0) {
    return { kind: "minutes", minutes };
  }
  return { kind: "minutes-seconds", minutes, seconds };
}

export function buildAgentTurnWorkSectionModel(
  group: AgentTranscriptTurnGroup,
  turn: AgentActivityTurn | null | undefined,
  nowUnixMs = Date.now()
): AgentTurnWorkSectionModel {
  const timing = resolveAgentTurnTiming(turn, nowUnixMs);
  if (!timing) {
    return {
      timing: null,
      userRows: [],
      workRowsBeforeFinal: group.rows,
      finalRows: [],
      workRowsAfterFinal: [],
      collapseEligible: false
    };
  }

  const userRows = group.rows.filter(({ row }) => isUserMessageRow(row));
  const agentRows = group.rows.filter(({ row }) => !isUserMessageRow(row));
  const finalTarget = findFinalAssistantCopyTarget(agentRows);
  if (!finalTarget) {
    return {
      timing,
      userRows,
      workRowsBeforeFinal: agentRows,
      finalRows: [],
      workRowsAfterFinal: [],
      collapseEligible: false
    };
  }

  const workRowsBeforeFinal = agentRows.slice(0, finalTarget.rowIndex);
  const workRowsAfterFinal = agentRows.slice(finalTarget.rowIndex + 1);
  const sourceEntry = agentRows[finalTarget.rowIndex]!;
  const sourceRow = sourceEntry.row as AgentMessageRowVM;
  const messagesBeforeFinal = sourceRow.messages.slice(
    0,
    finalTarget.messageIndex
  );
  const messagesAfterFinal = sourceRow.messages.slice(
    finalTarget.messageIndex + 1
  );

  if (sourceRow.thinking.length > 0 || messagesBeforeFinal.length > 0) {
    workRowsBeforeFinal.push({
      ...sourceEntry,
      row: cloneAssistantRow(
        sourceRow,
        `${sourceRow.id}:turn-work-before`,
        messagesBeforeFinal,
        sourceRow.thinking
      )
    });
  }

  const finalRows: AgentTranscriptTurnRow[] = [
    {
      ...sourceEntry,
      row: cloneAssistantRow(
        sourceRow,
        `${sourceRow.id}:turn-final`,
        [sourceRow.messages[finalTarget.messageIndex]!],
        []
      )
    }
  ];

  if (messagesAfterFinal.length > 0) {
    workRowsAfterFinal.unshift({
      ...sourceEntry,
      row: cloneAssistantRow(
        sourceRow,
        `${sourceRow.id}:turn-work-after`,
        messagesAfterFinal,
        []
      )
    });
  }

  const hasHiddenWork =
    workRowsBeforeFinal.length > 0 || workRowsAfterFinal.length > 0;
  const collapseEligible =
    turn?.phase === "settled" &&
    turn.outcome === "completed" &&
    hasHiddenWork &&
    !groupContainsBlockingMessage(group) &&
    !group.rows.some(({ row }) => row.kind === "generated-image");

  return {
    timing,
    userRows,
    workRowsBeforeFinal,
    finalRows,
    workRowsAfterFinal,
    collapseEligible
  };
}

function findFinalAssistantCopyTarget(
  rows: readonly AgentTranscriptTurnRow[]
): { rowIndex: number; messageIndex: number } | null {
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex]?.row;
    if (row?.kind !== "message" || row.speaker !== "assistant") {
      continue;
    }
    for (
      let messageIndex = row.messages.length - 1;
      messageIndex >= 0;
      messageIndex -= 1
    ) {
      if (row.messages[messageIndex]?.copyText?.trim()) {
        return { rowIndex, messageIndex };
      }
    }
  }
  return null;
}

function groupContainsBlockingMessage(
  group: AgentTranscriptTurnGroup
): boolean {
  return group.rows.some(
    ({ row }) =>
      row.kind === "message" &&
      row.messages.some((message) =>
        Boolean(message.visibleError || message.systemNotice)
      )
  );
}

function isUserMessageRow(
  row: AgentTranscriptTurnRow["row"]
): row is AgentMessageRowVM {
  return row.kind === "message" && row.speaker === "user";
}

function cloneAssistantRow(
  source: AgentMessageRowVM,
  id: string,
  messages: AgentMessageContentVM[],
  thinking: AgentMessageRowVM["thinking"]
): AgentMessageRowVM {
  return {
    ...source,
    id,
    messages,
    thinking
  };
}
