import {
  dialog,
  ipcMain,
  type BrowserWindow,
  type WebContents
} from "electron";
import { createHmac } from "node:crypto";
import {
  desktopIpcChannels,
  type DesktopManagedModelGrantRequest,
  type DesktopManagedModelGrantResult,
  type DesktopWorkspaceAppContext
} from "../../shared/contracts/ipc";
import { createTranslator, type DesktopLocale } from "../../shared/i18n";
import type { DesktopHostPreferencesState } from "../desktopHostPreferences";
import type { DesktopLogger } from "../logging";
import {
  resolveDesktopDaemonBaseUrl,
  type DesktopDaemonEndpoint
} from "../transport/paths";
import { registerDesktopIpcHandler } from "./handle";
import {
  dispatchWorkspaceAppOpenUrl,
  installWorkspaceAppWindowOpenHandler
} from "./workspaceAppWindowOpen.ts";

const workspaceAppGuestWebContents = new Set<WebContents>();
const workspaceAppGuestContexts = new Map<number, WorkspaceAppGuestContext>();

interface WorkspaceAppGuestContext {
  appID: string;
  ownerWindow: BrowserWindow;
  workspaceID: string;
}

export function registerWorkspaceAppGuestWebContents(
  ownerWindow: BrowserWindow,
  contents: WebContents,
  logger?: DesktopLogger,
  partition?: string | null
): void {
  workspaceAppGuestWebContents.add(contents);
  const context = readWorkspaceAppGuestContext(ownerWindow, partition);
  if (context) {
    workspaceAppGuestContexts.set(contents.id, context);
  } else {
    logger?.warn("workspace app guest context unavailable", {
      partition: partition ?? null,
      webContentsId: contents.id
    });
  }
  installWorkspaceAppWindowOpenHandler({ contents, logger, ownerWindow });
  contents.on("preload-error", (_event, preloadPath, error) => {
    logger?.warn("workspace app guest preload failed", {
      error: error.message,
      preloadPath,
      webContentsId: contents.id
    });
  });
  contents.once("destroyed", () => {
    workspaceAppGuestWebContents.delete(contents);
    workspaceAppGuestContexts.delete(contents.id);
  });
}

export function registerWorkspaceAppContextIpc(
  endpoint: DesktopDaemonEndpoint,
  preferences: DesktopHostPreferencesState,
  logger?: DesktopLogger
): void {
  registerDesktopIpcHandler(desktopIpcChannels.appContext.get, (event) =>
    createWorkspaceAppContext(
      endpoint,
      preferences.getLocale(),
      workspaceAppGuestContexts.get(event.sender.id)
    )
  );
  ipcMain.on(
    desktopIpcChannels.appContext.diagnostic,
    (_event, payload: unknown) => {
      const normalizedPayload = isWorkspaceAppDiagnosticPayload(payload)
        ? payload
        : null;
      const event =
        typeof normalizedPayload?.event === "string"
          ? normalizedPayload.event
          : "";
      if (event === "workspace-app-link-interception") {
        logger?.info("workspace app link interception diagnostic", {
          payload: normalizedPayload,
          webContentsId: _event.sender.id
        });
        return;
      }
      if (event.includes("failed")) {
        logger?.warn("workspace app context preload diagnostic", {
          payload: normalizedPayload
        });
      }
    }
  );
  ipcMain.on(desktopIpcChannels.appContext.openUrl, (event, payload) => {
    const context = workspaceAppGuestContexts.get(event.sender.id);
    logger?.info("workspace app open-url IPC received", {
      hasContext: Boolean(context),
      payload: normalizeWorkspaceAppOpenUrlLogPayload(payload),
      webContentsId: event.sender.id
    });
    if (!context || !isWorkspaceAppOpenUrlPayload(payload)) {
      logger?.warn("workspace app open-url IPC ignored", {
        hasContext: Boolean(context),
        payload: normalizeWorkspaceAppOpenUrlLogPayload(payload),
        webContentsId: event.sender.id
      });
      return;
    }
    dispatchWorkspaceAppOpenUrl({
      contents: event.sender,
      logger,
      ownerWindow: context.ownerWindow,
      url: payload.url
    });
  });
  registerDesktopIpcHandler(
    desktopIpcChannels.appContext.openSettings,
    (event, payload) => {
      const context = workspaceAppGuestContexts.get(event.sender.id);
      if (!context) {
        throw new Error("Workspace app context is unavailable.");
      }
      if (payload.section !== "apps" || payload.pane !== "managed-models") {
        throw new Error("Workspace app settings target is not allowed.");
      }
      context.ownerWindow.webContents.send(
        desktopIpcChannels.appContext.openSettingsRequested,
        payload
      );
    }
  );
  registerDesktopIpcHandler(
    desktopIpcChannels.appContext.requestManagedCredentialGrant,
    async (event, payload) => {
      const context = workspaceAppGuestContexts.get(event.sender.id);
      if (!context) {
        throw new Error("Workspace app context is unavailable.");
      }
      await confirmManagedCredentialGrant(
        context.ownerWindow,
        payload,
        preferences.getLocale()
      );
      return createManagedCredentialGrant(endpoint, context, payload);
    }
  );

  preferences.subscribe(() => {
    broadcastWorkspaceAppContext({
      locale: preferences.getLocale()
    });
  });
}

async function confirmManagedCredentialGrant(
  ownerWindow: BrowserWindow,
  payload: DesktopManagedModelGrantRequest,
  locale: DesktopLocale
): Promise<void> {
  const translator = createTranslator(locale);
  const providers =
    payload.providers && payload.providers.length > 0
      ? payload.providers.join(", ")
      : translator.t("workspaceApp.managedCredentials.configuredProviders");
  const result = await dialog.showMessageBox(ownerWindow, {
    buttons: [
      translator.t("workspaceApp.managedCredentials.allow"),
      translator.t("common.cancel")
    ],
    cancelId: 1,
    defaultId: 0,
    detail: translator.t("workspaceApp.managedCredentials.authorizationDetail"),
    message: translator.t(
      "workspaceApp.managedCredentials.authorizationMessage",
      { providers }
    ),
    noLink: true,
    title: translator.t("workspaceApp.managedCredentials.authorizationTitle"),
    type: "question"
  });
  if (result.response !== 0) {
    throw new Error("Managed model authorization was cancelled.");
  }
}

async function createManagedCredentialGrant(
  endpoint: DesktopDaemonEndpoint,
  context: WorkspaceAppGuestContext,
  payload: DesktopManagedModelGrantRequest
): Promise<DesktopManagedModelGrantResult> {
  const url = new URL(
    `/v1/workspaces/${encodeURIComponent(context.workspaceID)}/apps/${encodeURIComponent(context.appID)}/managed-model-grants`,
    resolveDesktopDaemonBaseUrl(endpoint)
  );
  const response = await fetch(url, {
    body: JSON.stringify({
      contextToken: payload.contextToken ?? "",
      nonce: payload.nonce ?? "",
      providers: payload.providers ?? [],
      scopes: payload.scopes ?? [],
      state: payload.state ?? ""
    }),
    headers: {
      Authorization: `Bearer ${endpoint.accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Managed model grant failed (${response.status}).`);
  }
  const result = (await response.json()) as DesktopManagedModelGrantResult;
  return {
    grantCode: result.grantCode,
    expiresAt: result.expiresAt,
    providers: result.providers,
    models: result.models
  };
}

function createWorkspaceAppContext(
  endpoint: DesktopDaemonEndpoint,
  locale: DesktopLocale,
  context: WorkspaceAppGuestContext | undefined
): DesktopWorkspaceAppContext {
  if (!context) {
    return { locale };
  }
  const issuer = new URL(resolveDesktopDaemonBaseUrl(endpoint)).origin;
  const installationId = `${context.workspaceID}:${context.appID}`;
  return {
    appId: context.appID,
    capabilities: [
      "managedCredentials.requestGrant@1",
      "workspace.openSettings@1"
    ],
    contextToken: createWorkspaceAppContextToken(endpoint, context, {
      installationId,
      issuer
    }),
    installationId,
    issuer,
    locale,
    workspaceId: context.workspaceID
  };
}

function createWorkspaceAppContextToken(
  endpoint: DesktopDaemonEndpoint,
  context: WorkspaceAppGuestContext,
  input: { installationId: string; issuer: string }
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    appId: context.appID,
    aud: context.appID,
    exp: nowSeconds + 5 * 60,
    iat: nowSeconds,
    installationId: input.installationId,
    iss: input.issuer,
    workspaceId: context.workspaceID
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const appToken = createAppServerToken(
    endpoint.accessToken,
    context.workspaceID,
    context.appID
  );
  const signature = createHmac("sha256", appToken)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function createAppServerToken(
  accessToken: string,
  workspaceID: string,
  appID: string
): string {
  const mac = createHmac("sha256", accessToken.trim());
  mac.update(workspaceID.trim());
  mac.update(Buffer.from([0]));
  mac.update(appID.trim());
  return `nextop-app-v1.${mac.digest("base64url")}`;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function readWorkspaceAppGuestContext(
  ownerWindow: BrowserWindow,
  partition: string | null | undefined
): WorkspaceAppGuestContext | null {
  const prefix = "persist:nextop-app:";
  if (!partition?.startsWith(prefix)) {
    return null;
  }
  const value = partition.slice(prefix.length);
  const separator = value.indexOf(":");
  if (separator <= 0 || separator >= value.length - 1) {
    return null;
  }
  return {
    appID: decodeURIComponent(value.slice(separator + 1)),
    ownerWindow,
    workspaceID: decodeURIComponent(value.slice(0, separator))
  };
}

function isWorkspaceAppDiagnosticPayload(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkspaceAppOpenUrlPayload(
  value: unknown
): value is { url: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { url?: unknown }).url === "string"
  );
}

function normalizeWorkspaceAppOpenUrlLogPayload(
  value: unknown
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const url = (value as { url?: unknown }).url;
  return {
    hasUrl: typeof url === "string" && url.trim().length > 0,
    url: typeof url === "string" ? url : null
  };
}

function broadcastWorkspaceAppContext(payload: { locale: string }): void {
  for (const contents of [...workspaceAppGuestWebContents]) {
    if (contents.isDestroyed()) {
      workspaceAppGuestWebContents.delete(contents);
      continue;
    }
    contents.send(desktopIpcChannels.appContext.changed, payload);
  }
}
