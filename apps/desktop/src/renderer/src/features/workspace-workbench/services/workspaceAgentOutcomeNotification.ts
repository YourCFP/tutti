import type { WorkspaceAgentMessageCenterItem } from "@tutti-os/agent-gui/agent-message-center";

export interface WorkspaceAgentOutcomeNotification {
  agentName: string;
  agentSessionId: string;
  body: string;
  conversationTitle: string;
  level: "error" | "success";
}

export interface WorkspaceAgentOutcomeNotificationLabels {
  completedBody: string;
  failedBody: string;
  fallbackAgentName: string;
}

export function buildWorkspaceAgentOutcomeNotification(
  item: WorkspaceAgentMessageCenterItem,
  labels: WorkspaceAgentOutcomeNotificationLabels
): WorkspaceAgentOutcomeNotification | null {
  const level = outcomeNotificationLevel(item.status);
  if (!level) {
    return null;
  }
  return {
    agentName:
      formatWorkspaceAgentProviderName(item.provider) ||
      labels.fallbackAgentName,
    agentSessionId: item.agentSessionId,
    body: level === "success" ? labels.completedBody : labels.failedBody,
    conversationTitle: item.title.trim(),
    level
  };
}

function outcomeNotificationLevel(
  status: WorkspaceAgentMessageCenterItem["status"]
): WorkspaceAgentOutcomeNotification["level"] | null {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    default:
      // Canceled turns are user-initiated and must stay silent; non-terminal
      // statuses are covered by the waiting/decision notifications.
      return null;
  }
}

function formatWorkspaceAgentProviderName(provider: string): string {
  return provider
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
