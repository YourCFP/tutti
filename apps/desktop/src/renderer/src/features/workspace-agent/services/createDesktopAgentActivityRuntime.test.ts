import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopAgentActivityRuntime } from "./createDesktopAgentActivityRuntime.ts";
import type { IWorkspaceAgentActivityService } from "./workspaceAgentActivityService.interface.ts";

test("desktop agent activity runtime forwards package diagnostics to renderer diagnostics", () => {
  const rendererDiagnostics: unknown[] = [];
  const runtime = createDesktopAgentActivityRuntime(
    createWorkspaceAgentActivityService(),
    {
      runtimeApi: {
        async logRendererDiagnostic(payload) {
          rendererDiagnostics.push(payload);
        },
        async logTerminalDiagnostic() {}
      }
    }
  );

  runtime.reportDiagnostic?.({
    details: {
      phase: "submit_interactive"
    },
    event: "agent.gui.caught_error",
    level: "error",
    workspaceId: "workspace-1"
  });

  assert.deepEqual(rendererDiagnostics, [
    {
      details: {
        phase: "submit_interactive"
      },
      event: "agent.gui.caught_error",
      level: "error",
      source: "agent-gui",
      workspaceId: "workspace-1"
    }
  ]);
});

function createWorkspaceAgentActivityService(): IWorkspaceAgentActivityService {
  return {
    _serviceBrand: undefined,
    activateSession: async () => {
      throw new Error("not implemented");
    },
    cancelSession: async () => {
      throw new Error("not implemented");
    },
    createSession: async () => {
      throw new Error("not implemented");
    },
    deleteSession: async () => {
      throw new Error("not implemented");
    },
    getSession: async () => {
      throw new Error("not implemented");
    },
    getComposerOptions: async () => {
      throw new Error("not implemented");
    },
    updateSessionSettings: async () => {
      throw new Error("not implemented");
    },
    getSessionControlState: async () => {
      throw new Error("not implemented");
    },
    getSnapshot: () => {
      throw new Error("not implemented");
    },
    listSessionMessages: async () => {
      throw new Error("not implemented");
    },
    listAgentGeneratedFiles: async () => {
      throw new Error("not implemented");
    },
    scanExternalSessionImports: async () => {
      throw new Error("not implemented");
    },
    importExternalSessions: async () => {
      throw new Error("not implemented");
    },
    load: async () => {
      throw new Error("not implemented");
    },
    onSessionEvent: () => () => {},
    submitInteractive: async () => {
      throw new Error("not implemented");
    },
    submitPlanDecision: async () => {
      throw new Error("not implemented");
    },
    ensureSessionSynchronized: () => () => {},
    retainSessionEvents: () => () => {},
    sendInput: async () => {
      throw new Error("not implemented");
    },
    readSessionAttachment: async () => {
      throw new Error("not implemented");
    },
    setSessionPinned: async () => {
      throw new Error("not implemented");
    },
    subscribe: () => () => {},
    unactivateSession: async () => {
      throw new Error("not implemented");
    }
  };
}
