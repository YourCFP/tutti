import type { NotificationLevel } from "@tutti-os/ui-notifications";
import type {
  WorkspaceAgentMessageCenterItem,
  WorkspaceAgentMessageCenterModel
} from "@tutti-os/agent-gui/agent-message-center";
import type { CompositeNotificationMessage } from "@renderer/lib/compositeNotificationService";

export type WorkspaceAgentMessageCenterNotificationStatus =
  | "canceled"
  | "completed"
  | "failed"
  | "idle"
  | "waiting"
  | "working";

export interface WorkspaceAgentMessageCenterNotificationLabels {
  description(input: { summary: string }): string;
  fallbackSummary: string;
  status: Record<WorkspaceAgentMessageCenterNotificationStatus, string>;
  title(input: { status: string; title: string }): string;
}

export interface WorkspaceAgentMessageCenterNotificationTracker {
  collect(
    model: WorkspaceAgentMessageCenterModel,
    labels: WorkspaceAgentMessageCenterNotificationLabels
  ): CompositeNotificationMessage[];
  reset(): void;
}

interface MessageCenterNotificationTrackedState {
  status: WorkspaceAgentMessageCenterNotificationStatus;
  waitingActionKey: string | null;
}

export function createWorkspaceAgentMessageCenterNotificationTracker(): WorkspaceAgentMessageCenterNotificationTracker {
  let previousStates: Map<
    string,
    MessageCenterNotificationTrackedState
  > | null = null;

  return {
    collect(model, labels) {
      const nextStates = new Map<
        string,
        MessageCenterNotificationTrackedState
      >();
      const messages: CompositeNotificationMessage[] = [];
      for (const item of model.items) {
        const state = messageCenterNotificationTrackedState(item);
        nextStates.set(item.agentSessionId, state);
        if (previousStates !== null) {
          const notificationStatus = messageCenterNotificationStatusForChange(
            previousStates.get(item.agentSessionId) ?? null,
            state
          );
          if (notificationStatus !== null) {
            messages.push(
              messageCenterNotificationMessage(item, labels, notificationStatus)
            );
          }
        }
      }
      previousStates = nextStates;
      return messages;
    },
    reset() {
      previousStates = null;
    }
  };
}

function messageCenterNotificationMessage(
  item: WorkspaceAgentMessageCenterItem,
  labels: WorkspaceAgentMessageCenterNotificationLabels,
  status: WorkspaceAgentMessageCenterNotificationStatus
): CompositeNotificationMessage {
  const statusLabel = labels.status[status];
  const summary = messageCenterNotificationSummary(item, labels);
  return {
    description: labels.description({ summary }),
    level: notificationLevelForStatus(status),
    // The OS face for waiting/failed is owned by the richer decision/outcome
    // notifications; keep these generic status messages in-app only.
    presentation: "foreground-only",
    title: labels.title({
      status: statusLabel,
      title: item.title
    })
  };
}

function messageCenterNotificationTrackedState(
  item: WorkspaceAgentMessageCenterItem
): MessageCenterNotificationTrackedState {
  return {
    status: messageCenterNotificationStatus(item),
    waitingActionKey: messageCenterWaitingActionKey(item)
  };
}

function messageCenterNotificationStatusForChange(
  previous: MessageCenterNotificationTrackedState | null,
  next: MessageCenterNotificationTrackedState
): WorkspaceAgentMessageCenterNotificationStatus | null {
  if (next.status === "waiting") {
    if (
      previous?.status !== "waiting" ||
      previous.waitingActionKey !== next.waitingActionKey
    ) {
      return "waiting";
    }
    return null;
  }

  if (!isTerminalNotificationStatus(next.status) || previous === null) {
    return null;
  }

  if (!isInterruptingTerminalStatus(next.status)) {
    return null;
  }

  return previous.status === next.status ? null : next.status;
}

function isInterruptingTerminalStatus(
  status: WorkspaceAgentMessageCenterNotificationStatus
): boolean {
  // A background task finishing or being canceled should not interrupt with a
  // toast; only surface failures proactively. Completions stay visible in the
  // message center panel and the trigger badge.
  return status === "failed";
}

function messageCenterNotificationStatus(
  item: WorkspaceAgentMessageCenterItem
): WorkspaceAgentMessageCenterNotificationStatus {
  if (isNotificationWaitingMessageCenterItem(item)) {
    return "waiting";
  }
  switch (item.status) {
    case "canceled":
    case "completed":
    case "failed":
    case "idle":
    case "working":
      return item.status;
    case "waiting":
      return "waiting";
    default:
      return "idle";
  }
}

function isNotificationWaitingMessageCenterItem(
  item: WorkspaceAgentMessageCenterItem
): boolean {
  return item.pendingPrompt !== null || item.needsAttentionKind !== null;
}

function isTerminalNotificationStatus(
  status: WorkspaceAgentMessageCenterNotificationStatus
): boolean {
  switch (status) {
    case "canceled":
    case "completed":
    case "failed":
    case "idle":
      return true;
    case "waiting":
    case "working":
      return false;
  }
}

function messageCenterWaitingActionKey(
  item: WorkspaceAgentMessageCenterItem
): string | null {
  if (item.pendingPrompt !== null) {
    return `prompt:${item.pendingPrompt.kind}:${item.pendingPrompt.requestId}`;
  }
  if (item.needsAttentionKind !== null) {
    return `attention:${item.needsAttentionKind}:${item.needsAttentionSummary?.trim() ?? ""}`;
  }
  return null;
}

function messageCenterNotificationSummary(
  item: WorkspaceAgentMessageCenterItem,
  labels: WorkspaceAgentMessageCenterNotificationLabels
): string {
  return (
    item.needsAttentionSummary?.trim() ||
    item.pendingPrompt?.title.trim() ||
    item.lastAgentMessageSummary.trim() ||
    labels.fallbackSummary
  );
}

function notificationLevelForStatus(
  status: WorkspaceAgentMessageCenterNotificationStatus
): NotificationLevel {
  switch (status) {
    case "failed":
      return "error";
    case "waiting":
    case "canceled":
      return "warning";
    case "completed":
    case "idle":
      return "success";
    case "working":
      return "info";
  }
}
