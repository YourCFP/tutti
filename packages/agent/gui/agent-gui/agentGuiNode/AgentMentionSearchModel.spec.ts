import { describe, expect, it } from "vitest";
import { managedAgentRoundedIconUrl } from "../../shared/managedAgentIcons";
import { providerItemToAgentMentionItem } from "./AgentMentionSearchModel";

describe("providerItemToAgentMentionItem", () => {
  it("preserves Agent Target identity in session mention metadata", () => {
    expect(
      providerItemToAgentMentionItem({
        currentUserId: "user-1",
        providerId: "agent-session",
        insertResult: {
          kind: "mention",
          mention: {
            entityId: "session-1",
            label: "Previous session",
            scope: {
              agentTargetId: "extension:gemini",
              workspaceId: "workspace-1"
            }
          }
        },
        label: "Previous session",
        subtitle: "Gemini CLI",
        workspaceId: "workspace-1"
      })
    ).toMatchObject({
      agentTargetId: "extension:gemini",
      href: "mention://agent-session/session-1?agentTargetId=extension%3Agemini&workspaceId=workspace-1",
      kind: "session"
    });
  });

  it("resolves a Session Agent icon from provider identity instead of its owner-qualified name", () => {
    expect(
      providerItemToAgentMentionItem({
        currentUserId: "user-1",
        providerId: "agent-session",
        insertResult: {
          kind: "mention",
          mention: {
            entityId: "session-1",
            label: "Previous session",
            scope: {
              agentTargetId: "shared-agent:shared-codex",
              workspaceId: "workspace-1"
            },
            presentation: {
              agentProviderId: "codex",
              subtitle: "Lin · Codex (Shared)"
            }
          }
        },
        label: "Previous session",
        subtitle: "Codex",
        workspaceId: "workspace-1"
      })
    ).toMatchObject({
      agentIconUrl: managedAgentRoundedIconUrl("codex"),
      agentName: "Lin · Codex (Shared)",
      kind: "session"
    });
  });
});
