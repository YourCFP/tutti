import "./lib/whyDidYouRender";
import * as React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@tutti-os/ui-system";
import { RendererApp } from "./app";
import { I18nProvider } from "./i18n";
import { NativeTooltipSuppressor } from "./lib/nativeTooltipSuppression";
import {
  createReactRootErrorLogger,
  createRenderStormTracker,
  installBrowserCrashLogging
} from "./lib/reactDiagnostics";
import { createRendererDiagnosticSink } from "./app/windows/createRendererDiagnosticsContainer";
import { DesktopToastProvider } from "./lib/toast";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Renderer root element '#app' was not found.");
}

const logRendererDiagnostic = createRendererDiagnosticSink();

installBrowserCrashLogging({
  logRendererDiagnostic
});
const renderStormTracker = createRenderStormTracker({
  logRendererDiagnostic
});

const rendererApp = import.meta.env.DEV ? (
  <React.Profiler
    id="TuttiRenderer"
    onRender={(
      id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime
    ) => {
      renderStormTracker.record({
        actualDuration,
        baseDuration,
        commitTime,
        id,
        phase,
        startTime
      });
    }}
  >
    <RendererApp />
  </React.Profiler>
) : (
  <RendererApp />
);
const logReactRootError = createReactRootErrorLogger({
  captureOwnerStack: React.captureOwnerStack,
  logRendererDiagnostic
});

createRoot(root, {
  onCaughtError(error, errorInfo) {
    logReactRootError("caught", error, errorInfo);
  },
  onRecoverableError(error, errorInfo) {
    logReactRootError("recoverable", error, errorInfo);
  },
  onUncaughtError(error, errorInfo) {
    logReactRootError("uncaught", error, errorInfo);
  }
}).render(
  <StrictMode>
    <I18nProvider>
      <TooltipProvider>
        <NativeTooltipSuppressor />
        <DesktopToastProvider>{rendererApp}</DesktopToastProvider>
      </TooltipProvider>
    </I18nProvider>
  </StrictMode>
);
