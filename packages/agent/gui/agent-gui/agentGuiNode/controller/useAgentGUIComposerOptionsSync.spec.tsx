import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentActivityRuntime } from "../../../agentActivityRuntime";
import type { AgentGUIProvider, AgentGUINodeData } from "../../../types";
import type { AgentSessionEngine } from "@tutti-os/agent-activity-core";
import { setAgentHostApiForTests } from "../../../agentActivityHost";
import type { AgentHostRuntimeApi } from "../../../host/agentHostApi";
import type { AgentGUIComposerTargetData } from "./agentGuiController.composerPresentation";
import { useAgentGUIComposerOptionsSync } from "./useAgentGUIComposerOptionsSync";

describe("useAgentGUIComposerOptionsSync", () => {
  it("loads a switched target once without bypassing its cache", async () => {
    const getComposerOptions = vi.fn(async () => ({}));
    const activeConversationIdRef = { current: null };
    const dataRef = { current: targetData("codex") };
    const selectedTargetRef = { current: composerTarget("codex") };
    const selectedProjectPathRef = { current: "/workspace/project" };
    const { result, rerender } = renderHook(
      ({ provider }) => {
        const target = composerTarget(provider);
        dataRef.current = target.data;
        selectedTargetRef.current = target;
        return useAgentGUIComposerOptionsSync({
          activeConversationId: null,
          activeConversationIdRef,
          agentActivityRuntime: {
            getComposerOptions
          } as unknown as AgentActivityRuntime,
          composerTargetData: target,
          conversationFilter: null,
          currentUserId: "user-1",
          data: target.data,
          dataRef,
          defaultReasoningEffort: "high",
          draftSettingsBySessionIdRef: { current: {} },
          isComposerHome: true,
          isComposerHomeRef: { current: true },
          isCreatingConversation: false,
          loadDraftComposerOptionsRef: { current: () => {} },
          loadSessionState: vi.fn(),
          onComposerDefaultsAuthorityReloadedRef: { current: vi.fn() },
          previewMode: false,
          providerComposerOptions: null,
          reloadSelectedConversation: vi.fn(),
          selectedComposerTargetDataRef: selectedTargetRef,
          selectedProjectPath: "/workspace/project",
          selectedProjectPathRef,
          sessionEngine: {
            getSnapshot: () => ({})
          } as unknown as AgentSessionEngine,
          syncConversationListProjection: vi.fn(async () => {}),
          workspaceId: "workspace-1",
          workspacePath: "/workspace"
        });
      },
      { initialProps: { provider: "codex" as AgentGUIProvider } }
    );

    await waitFor(() => expect(getComposerOptions).toHaveBeenCalledTimes(1));
    getComposerOptions.mockClear();

    rerender({ provider: "claude-code" });

    await waitFor(() => expect(getComposerOptions).toHaveBeenCalledTimes(1));
    expect(getComposerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTargetId: "local:claude-code",
        force: undefined,
        provider: "claude-code"
      })
    );

    getComposerOptions.mockClear();
    await result.current.reloadComposerOptionsForTarget({
      settings: { planMode: false },
      target: selectedTargetRef.current
    });
    expect(getComposerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTargetId: "local:claude-code",
        force: true,
        settings: { planMode: false }
      })
    );
  });

  it("loads composer options after conversation creation settles", async () => {
    const getComposerOptions = vi.fn(async () => ({}));
    const data: AgentGUINodeData = {
      provider: "codex",
      agentTargetId: "local:codex",
      lastActiveAgentSessionId: null
    };
    const target: AgentGUIComposerTargetData = {
      agentTargetId: "local:codex",
      data,
      provider: "codex",
      targetId: "local:codex"
    };
    const activeConversationIdRef = { current: null };
    const dataRef = { current: data };
    const selectedTargetRef = { current: target };
    const selectedProjectPathRef = { current: "/workspace/project" };

    const { rerender } = renderHook(
      ({ isCreatingConversation }) =>
        useAgentGUIComposerOptionsSync({
          activeConversationId: null,
          activeConversationIdRef,
          agentActivityRuntime: {
            getComposerOptions
          } as unknown as AgentActivityRuntime,
          composerTargetData: target,
          conversationFilter: null,
          currentUserId: "user-1",
          data,
          dataRef,
          defaultReasoningEffort: "high",
          draftSettingsBySessionIdRef: { current: {} },
          isComposerHome: true,
          isComposerHomeRef: { current: true },
          isCreatingConversation,
          loadDraftComposerOptionsRef: { current: () => {} },
          loadSessionState: vi.fn(),
          onComposerDefaultsAuthorityReloadedRef: { current: vi.fn() },
          previewMode: false,
          providerComposerOptions: null,
          reloadSelectedConversation: vi.fn(),
          selectedComposerTargetDataRef: selectedTargetRef,
          selectedProjectPath: "/workspace/project",
          selectedProjectPathRef,
          sessionEngine: {
            getSnapshot: () => ({})
          } as unknown as AgentSessionEngine,
          syncConversationListProjection: vi.fn(async () => {}),
          workspaceId: "workspace-1",
          workspacePath: "/workspace"
        }),
      { initialProps: { isCreatingConversation: true } }
    );

    expect(getComposerOptions).not.toHaveBeenCalled();

    rerender({ isCreatingConversation: false });

    await waitFor(() => {
      expect(getComposerOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          agentTargetId: "local:codex",
          cwd: "/workspace/project",
          force: true,
          provider: "codex",
          workspaceId: "workspace-1"
        })
      );
    });
  });

  it("rereads target authority on invalidation without sending local persistent intent", async () => {
    const getComposerOptions = vi.fn(async () => ({}));
    let emitHostEvent: ((event: unknown) => void) | null = null;
    setAgentHostApiForTests({
      onHostEvent: (listener: (event: unknown) => void) => {
        emitHostEvent = listener;
        return () => {
          emitHostEvent = null;
        };
      }
    } as unknown as AgentHostRuntimeApi);
    const data = targetData("opencode");
    const target = composerTarget("opencode");
    const draftSettingsBySessionIdRef = {
      current: {
        "__agent_gui_node_defaults__:target:local:opencode": {
          model: "opencode/new-model",
          permissionModeId: "full-access",
          planMode: false,
          reasoningEffort: "high" as const,
          speed: "fast" as const
        }
      }
    };
    const onAuthorityReloaded = vi.fn();
    const rendered = renderHook(() =>
      useAgentGUIComposerOptionsSync({
        activeConversationId: null,
        activeConversationIdRef: { current: null },
        agentActivityRuntime: {
          getComposerOptions
        } as unknown as AgentActivityRuntime,
        composerTargetData: target,
        conversationFilter: null,
        currentUserId: "user-1",
        data,
        dataRef: { current: data },
        defaultReasoningEffort: null,
        draftSettingsBySessionIdRef,
        isComposerHome: true,
        isComposerHomeRef: { current: true },
        isCreatingConversation: false,
        loadDraftComposerOptionsRef: { current: () => {} },
        loadSessionState: vi.fn(),
        onComposerDefaultsAuthorityReloadedRef: {
          current: onAuthorityReloaded
        },
        previewMode: false,
        providerComposerOptions: null,
        reloadSelectedConversation: vi.fn(),
        selectedComposerTargetDataRef: { current: target },
        selectedProjectPath: "/workspace/project",
        selectedProjectPathRef: { current: "/workspace/project" },
        sessionEngine: {
          getSnapshot: () => ({})
        } as unknown as AgentSessionEngine,
        syncConversationListProjection: vi.fn(async () => {}),
        workspaceId: "workspace-1",
        workspacePath: "/workspace"
      })
    );

    try {
      await waitFor(() => expect(getComposerOptions).toHaveBeenCalled());
      getComposerOptions.mockClear();
      act(() => {
        emitHostEvent?.({
          agentTargetId: "local:opencode",
          scope: "global",
          type: "agent-composer-defaults-invalidated"
        });
      });
      await waitFor(() =>
        expect(getComposerOptions).toHaveBeenCalledWith(
          expect.objectContaining({
            agentTargetId: "local:opencode",
            force: true,
            settings: { planMode: false }
          })
        )
      );
      expect(draftSettingsBySessionIdRef.current).toMatchObject({
        "__agent_gui_node_defaults__:target:local:opencode": {
          permissionModeId: "full-access"
        }
      });
      expect(onAuthorityReloaded).toHaveBeenCalledWith(target);
    } finally {
      rendered.unmount();
      setAgentHostApiForTests(null);
    }
  });
});

function targetData(provider: AgentGUIProvider): AgentGUINodeData {
  return {
    agentTargetId: `local:${provider}`,
    lastActiveAgentSessionId: null,
    provider
  };
}

function composerTarget(
  provider: AgentGUIProvider
): AgentGUIComposerTargetData {
  return {
    agentTargetId: `local:${provider}`,
    data: targetData(provider),
    provider,
    targetId: `local:${provider}`
  };
}
