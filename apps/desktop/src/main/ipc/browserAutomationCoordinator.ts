import { ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";
import { randomUUID } from "node:crypto";
import type {
  BrowserNodeAutomationTargetRequest,
  BrowserNodeAutomationTargetSummary
} from "@tutti-os/browser-node/electron-main";
import {
  desktopIpcChannels,
  type DesktopBrowserAutomationRequest,
  type DesktopBrowserAutomationResponse
} from "../../shared/contracts/ipc.ts";
import { findWorkspaceWindow } from "../windows/workspaceWindow.ts";

const requestTimeoutMs = 10_000;

interface PendingRequest {
  reject(error: Error): void;
  resolve(nodeId: string | null): void;
  senderId: number;
  timeout: ReturnType<typeof setTimeout>;
}

export interface DesktopBrowserAutomationCoordinator {
  closeTarget(target: BrowserNodeAutomationTargetSummary): Promise<void>;
  dispose(): void;
  requestTarget(
    input: BrowserNodeAutomationTargetRequest
  ): Promise<string | null>;
  selectTarget(target: BrowserNodeAutomationTargetSummary): Promise<void>;
}

export function createDesktopBrowserAutomationCoordinator(): DesktopBrowserAutomationCoordinator {
  const pending = new Map<string, PendingRequest>();
  const handleResponse = (
    event: IpcMainEvent,
    response: DesktopBrowserAutomationResponse
  ): void => {
    const request = pending.get(response?.requestId);
    if (!request || request.senderId !== event.sender.id) return;
    pending.delete(response.requestId);
    clearTimeout(request.timeout);
    if (!response.ok) {
      request.reject(new Error(response.error));
      return;
    }
    request.resolve(response.nodeId);
  };
  ipcMain.on(desktopIpcChannels.browser.automationResponse, handleResponse);

  const send = (
    request: Omit<DesktopBrowserAutomationRequest, "requestId">
  ): Promise<string | null> => {
    const ownerWindow = resolveOwnerWindow(request);
    if (!ownerWindow || ownerWindow.webContents.isDestroyed()) {
      return Promise.reject(
        new Error(
          `No ${request.surfaceRole} Browser surface host is available for workspace ${request.workspaceId}`
        )
      );
    }
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("In-app Browser surface request timed out"));
      }, requestTimeoutMs);
      pending.set(requestId, {
        reject,
        resolve,
        senderId: ownerWindow.webContents.id,
        timeout
      });
      ownerWindow.webContents.send(
        desktopIpcChannels.browser.automationRequest,
        { ...request, requestId } satisfies DesktopBrowserAutomationRequest
      );
    });
  };

  return {
    async closeTarget(target) {
      await send({
        action: "close",
        agentSessionId: target.agentSessionId ?? null,
        nodeId: target.nodeId,
        surfaceRole: target.surfaceRole,
        url: null,
        workspaceId: target.workspaceId
      });
    },
    dispose() {
      ipcMain.off(
        desktopIpcChannels.browser.automationResponse,
        handleResponse
      );
      for (const request of pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error("In-app Browser automation stopped"));
      }
      pending.clear();
    },
    requestTarget(input) {
      return send({
        action: "create",
        agentSessionId: input.agentSessionId,
        nodeId: input.requestedPageId ?? null,
        surfaceRole: input.agentSessionId ? "agent" : "user",
        url: input.url ?? null,
        workspaceId: input.workspaceId
      });
    },
    async selectTarget(target) {
      await send({
        action: "select",
        agentSessionId: target.agentSessionId ?? null,
        nodeId: target.nodeId,
        surfaceRole: target.surfaceRole,
        url: null,
        workspaceId: target.workspaceId
      });
    }
  };
}

function resolveOwnerWindow(
  request: Pick<DesktopBrowserAutomationRequest, "surfaceRole" | "workspaceId">
): BrowserWindow | null {
  return findWorkspaceWindow(
    request.workspaceId,
    request.surfaceRole === "agent" ? "agent" : "workspace"
  );
}
