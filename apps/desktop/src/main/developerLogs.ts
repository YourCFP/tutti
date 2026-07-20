import { createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  truncate
} from "node:fs/promises";
import type { Dirent } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import type {
  ClearDeveloperLogsResult,
  DesktopDeveloperLogFileSummary,
  DesktopDeveloperLogKind,
  DesktopDeveloperLogsExportScope,
  DesktopDeveloperLogsState,
  ExportDeveloperLogsResult
} from "../shared/contracts/ipc";
import type { DesktopResolvedDefaults } from "./defaults";
import {
  buildProviderAgentSessionRecordFiles,
  type DeveloperLogsAgentSessionRecord,
  type ExportedAgentSessionFile
} from "./developerLogsAgentSessions.ts";
import yazl from "yazl";

export interface DeveloperLogsDependencies {
  appCenterSnapshotProvider?: () => Promise<DeveloperLogsAppCenterSnapshot | null>;
  agentSessionsProvider?: () => Promise<DeveloperLogsAgentSessionRecord[]>;
  defaults: Pick<DesktopResolvedDefaults, "state">;
  desktopVersion: string;
  flushLogs?: () => Promise<void> | void;
  getDownloadsPath?: () => string;
  now?: () => Date;
  persistedLocale?: string | null;
  preferredSystemLanguages?: readonly string[] | null;
  systemLocale?: string | null;
  transportSnapshot?: unknown;
}

export interface DeveloperLogsExportOptions {
  savePath?: string;
  scope?: DesktopDeveloperLogsExportScope;
}

const recentDeveloperLogsWindowMs = 10 * 60 * 1_000;

export interface DeveloperLogsAppCenterSnapshot {
  workspaces: Array<{
    appFactoryJobsResponse: unknown;
    appsResponse: unknown;
    workspaceId: string;
  }>;
}

const managedDesktopLogPrefixes = ["tutti-desktop"];
const managedDaemonLogPrefixes = ["tuttid"];

type DeveloperDiagnosticsArtifact =
  | {
      kind: "file";
      category: "managed-log" | "workspace-app-log" | "app-factory-log";
      path: string;
      archivePath: string;
      modifiedAtUnixMs: number;
      sizeBytes: number;
      clearable: true;
      clearMode: "truncate" | "remove";
    }
  | {
      kind: "generated";
      category: "agent-session";
      archivePath: string;
      content: Buffer;
      sizeBytes: number;
      clearable: false;
      agentSessionID: string;
      path: string;
      provider: "claude-code" | "codex" | "cursor";
      updatedAtUnixMS: number;
      workspaceID: string;
    }
  | {
      kind: "generated";
      category: "app-center-snapshot";
      archivePath: string;
      content: Buffer;
      sizeBytes: number;
      clearable: false;
    };

export function createDeveloperLogsService(
  deps: DeveloperLogsDependencies
): DeveloperLogsService {
  return new DeveloperLogsService(deps);
}

export class DeveloperLogsService {
  private readonly deps: DeveloperLogsDependencies;

  constructor(deps: DeveloperLogsDependencies) {
    this.deps = deps;
  }

  async getLogsState(): Promise<DesktopDeveloperLogsState> {
    await this.deps.flushLogs?.();
    const files = await Promise.all([
      summarizeLogFile("daemon", this.deps.defaults.state.tuttidLogPath),
      summarizeLogFile("desktop", this.deps.defaults.state.desktopLogPath)
    ]);
    const managed = await listManagedLogFiles(this.deps.defaults.state.logsDir);

    return {
      desktopVersion: this.deps.desktopVersion,
      files,
      logsDir: this.deps.defaults.state.logsDir,
      totalFiles: managed.length,
      totalSizeBytes: managed.reduce((sum, file) => sum + file.sizeBytes, 0)
    };
  }

  async clearLogs(): Promise<ClearDeveloperLogsResult> {
    const artifacts = await discoverDeveloperDiagnosticsArtifacts(this.deps);
    let clearedFiles = 0;
    let clearedSizeBytes = 0;
    const clearedPaths: string[] = [];

    for (const artifact of artifacts) {
      if (!artifact.clearable) {
        continue;
      }

      if (artifact.clearMode === "truncate") {
        await truncate(artifact.path, 0);
      } else {
        await rm(artifact.path, { force: true });
      }
      clearedFiles += 1;
      clearedSizeBytes += artifact.sizeBytes;
      clearedPaths.push(artifact.path);
    }

    return {
      clearedFiles,
      clearedPaths,
      clearedSizeBytes
    };
  }

  async exportLogs(
    options: DeveloperLogsExportOptions = {}
  ): Promise<ExportDeveloperLogsResult> {
    await this.deps.flushLogs?.();
    const artifacts = await discoverDeveloperDiagnosticsArtifacts(this.deps);
    const exportedAt = this.deps.now?.() ?? new Date();
    const scope = options.scope ?? "all";
    const windowStart =
      scope === "recent-10-minutes"
        ? new Date(exportedAt.getTime() - recentDeveloperLogsWindowMs)
        : null;
    const discoveredFileArtifacts = artifacts.filter(
      (
        artifact
      ): artifact is Extract<DeveloperDiagnosticsArtifact, { kind: "file" }> =>
        artifact.kind === "file"
    );
    const fileArtifacts = await prepareDeveloperLogFilesForExport(
      discoveredFileArtifacts,
      windowStart
        ? {
            endTimeUnixMs: exportedAt.getTime(),
            startTimeUnixMs: windowStart.getTime()
          }
        : null
    );
    const discoveredGeneratedArtifacts = artifacts.filter(
      (
        artifact
      ): artifact is Extract<
        DeveloperDiagnosticsArtifact,
        { kind: "generated" }
      > => artifact.kind === "generated"
    );
    const generatedArtifacts = discoveredGeneratedArtifacts.filter(
      (artifact) =>
        artifact.category !== "agent-session" ||
        !windowStart ||
        (artifact.updatedAtUnixMS >= windowStart.getTime() &&
          artifact.updatedAtUnixMS <= exportedAt.getTime())
    );
    const agentSessionArtifacts = generatedArtifacts.filter(
      (
        artifact
      ): artifact is Extract<
        DeveloperDiagnosticsArtifact,
        { category: "agent-session" }
      > => artifact.category === "agent-session"
    );
    const appCenterSnapshotIncluded = generatedArtifacts.some(
      (artifact) => artifact.category === "app-center-snapshot"
    );

    if (fileArtifacts.length === 0 && generatedArtifacts.length === 0) {
      return {
        canceled: false,
        fileCount: 0,
        filePath: await this.writeEmptyExport({
          exportedAt,
          savePath: options.savePath,
          scope,
          windowStart
        })
      };
    }

    const targetPath = options.savePath
      ? ensureZipFilePath(options.savePath)
      : ensureZipFilePath(
          join(
            this.deps.getDownloadsPath?.() ?? this.deps.defaults.state.logsDir,
            createDefaultDeveloperLogsExportFileName(exportedAt, scope)
          )
        );

    await mkdir(dirname(targetPath), { recursive: true });

    const zipFile = new yazl.ZipFile();
    const output = createWriteStream(targetPath);
    const completed = new Promise<void>((resolveCompleted, rejectCompleted) => {
      output.on("close", resolveCompleted);
      output.on("error", rejectCompleted);
      zipFile.outputStream.on("error", rejectCompleted);
    });

    zipFile.outputStream.pipe(output);

    for (const artifact of fileArtifacts) {
      zipFile.addBuffer(artifact.content, artifact.archivePath);
    }
    for (const artifact of generatedArtifacts) {
      zipFile.addBuffer(artifact.content, artifact.archivePath);
    }

    const runtimeContext = buildRuntimeContext({
      defaults: this.deps.defaults,
      desktopVersion: this.deps.desktopVersion,
      agentSessionFiles: agentSessionArtifacts.map((artifact) => ({
        agentSessionID: artifact.agentSessionID,
        archivePath: artifact.archivePath,
        content: artifact.content,
        path: artifact.path,
        provider: artifact.provider,
        sizeBytes: artifact.sizeBytes,
        workspaceID: artifact.workspaceID
      })),
      logFiles: fileArtifacts.map((artifact) => ({
        archivePath: artifact.archivePath,
        modifiedAtUnixMs: artifact.modifiedAtUnixMs,
        path: artifact.path,
        sizeBytes: artifact.sizeBytes
      })),
      persistedLocale: this.deps.persistedLocale ?? null,
      preferredSystemLanguages: this.deps.preferredSystemLanguages ?? null,
      systemLocale: this.deps.systemLocale ?? null,
      transportSnapshot: this.deps.transportSnapshot ?? null
    });

    zipFile.addBuffer(
      Buffer.from(JSON.stringify(runtimeContext, null, 2), "utf8"),
      "runtime-context.json"
    );
    zipFile.addBuffer(
      Buffer.from(
        JSON.stringify(
          {
            schemaVersion: 1,
            desktopVersion: this.deps.desktopVersion,
            exportedAt: exportedAt.toISOString(),
            scope,
            windowStart: windowStart?.toISOString() ?? null,
            logsDir: this.deps.defaults.state.logsDir,
            agentSessionFileCount: agentSessionArtifacts.length,
            appCenterSnapshotIncluded,
            appFactoryLogFileCount: fileArtifacts.filter(
              (artifact) => artifact.category === "app-factory-log"
            ).length,
            appLogFileCount: fileArtifacts.filter(
              (artifact) => artifact.category === "workspace-app-log"
            ).length,
            fileCount: fileArtifacts.length + generatedArtifacts.length,
            managedLogFileCount: fileArtifacts.filter(
              (artifact) => artifact.category === "managed-log"
            ).length,
            totalSizeBytes: [...fileArtifacts, ...generatedArtifacts].reduce(
              (sum, artifact) => sum + artifact.sizeBytes,
              0
            )
          },
          null,
          2
        ),
        "utf8"
      ),
      "export-summary.json"
    );

    zipFile.end();
    await completed;

    return {
      canceled: false,
      fileCount: fileArtifacts.length + generatedArtifacts.length,
      filePath: targetPath
    };
  }

  private async writeEmptyExport(input: {
    exportedAt: Date;
    savePath?: string;
    scope: DesktopDeveloperLogsExportScope;
    windowStart: Date | null;
  }): Promise<string> {
    const targetPath = ensureZipFilePath(
      input.savePath ??
        join(
          this.deps.getDownloadsPath?.() ?? this.deps.defaults.state.logsDir,
          createDefaultDeveloperLogsExportFileName(
            input.exportedAt,
            input.scope
          )
        )
    );
    await mkdir(dirname(targetPath), { recursive: true });
    const zipFile = new yazl.ZipFile();
    const output = createWriteStream(targetPath);
    const completed = new Promise<void>((resolveCompleted, rejectCompleted) => {
      output.on("close", resolveCompleted);
      output.on("error", rejectCompleted);
      zipFile.outputStream.on("error", rejectCompleted);
    });
    zipFile.outputStream.pipe(output);
    const runtimeContext = buildRuntimeContext({
      defaults: this.deps.defaults,
      desktopVersion: this.deps.desktopVersion,
      agentSessionFiles: [],
      logFiles: [],
      persistedLocale: this.deps.persistedLocale ?? null,
      preferredSystemLanguages: this.deps.preferredSystemLanguages ?? null,
      systemLocale: this.deps.systemLocale ?? null,
      transportSnapshot: this.deps.transportSnapshot ?? null
    });
    zipFile.addBuffer(
      Buffer.from(JSON.stringify(runtimeContext, null, 2), "utf8"),
      "runtime-context.json"
    );
    zipFile.addBuffer(
      Buffer.from(
        JSON.stringify(
          {
            schemaVersion: 1,
            desktopVersion: this.deps.desktopVersion,
            exportedAt: input.exportedAt.toISOString(),
            scope: input.scope,
            windowStart: input.windowStart?.toISOString() ?? null,
            logsDir: this.deps.defaults.state.logsDir,
            agentSessionFileCount: 0,
            fileCount: 0,
            totalSizeBytes: 0
          },
          null,
          2
        ),
        "utf8"
      ),
      "export-summary.json"
    );
    zipFile.end();
    await completed;
    return targetPath;
  }
}

interface ManagedLogFile {
  modifiedAtUnixMs: number;
  path: string;
  sizeBytes: number;
}

interface DiscoveredLogFile extends ManagedLogFile {
  archivePath: string;
}

type DeveloperDiagnosticsFileArtifact = Extract<
  DeveloperDiagnosticsArtifact,
  { kind: "file" }
>;

type PreparedDeveloperDiagnosticsFile = DeveloperDiagnosticsFileArtifact & {
  content: Buffer;
};

interface DeveloperLogsTimeWindow {
  endTimeUnixMs: number;
  startTimeUnixMs: number;
}

async function prepareDeveloperLogFilesForExport(
  artifacts: DeveloperDiagnosticsFileArtifact[],
  timeWindow: DeveloperLogsTimeWindow | null
): Promise<PreparedDeveloperDiagnosticsFile[]> {
  const prepared = await Promise.all(
    artifacts.map(async (artifact) => {
      const originalContent = await readFile(artifact.path);
      const content = timeWindow
        ? filterDeveloperLogContentByTime({
            content: originalContent,
            modifiedAtUnixMs: artifact.modifiedAtUnixMs,
            timeWindow
          })
        : originalContent;

      if (content === null || (timeWindow && content.byteLength === 0)) {
        return null;
      }

      return {
        ...artifact,
        content,
        sizeBytes: content.byteLength
      } satisfies PreparedDeveloperDiagnosticsFile;
    })
  );

  return prepared.filter(
    (artifact): artifact is PreparedDeveloperDiagnosticsFile =>
      artifact !== null
  );
}

function filterDeveloperLogContentByTime(input: {
  content: Buffer;
  modifiedAtUnixMs: number;
  timeWindow: DeveloperLogsTimeWindow;
}): Buffer | null {
  const segments = input.content
    .toString("utf8")
    .match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)
    ?.filter((segment) => segment.length > 0);
  if (!segments || segments.length === 0) {
    return null;
  }

  let foundTimestamp = false;
  let includeContinuation = false;
  const selectedSegments: string[] = [];

  for (const segment of segments) {
    const timestamp = parseDeveloperLogTimestamp(segment);
    if (timestamp !== null) {
      foundTimestamp = true;
      includeContinuation =
        timestamp >= input.timeWindow.startTimeUnixMs &&
        timestamp <= input.timeWindow.endTimeUnixMs;
    }

    if (includeContinuation) {
      selectedSegments.push(segment);
    }
  }

  if (foundTimestamp) {
    return Buffer.from(selectedSegments.join(""), "utf8");
  }

  const fileWasUpdatedInWindow =
    input.modifiedAtUnixMs >= input.timeWindow.startTimeUnixMs &&
    input.modifiedAtUnixMs <= input.timeWindow.endTimeUnixMs;
  return fileWasUpdatedInWindow ? input.content : null;
}

function parseDeveloperLogTimestamp(line: string): number | null {
  const structuredTime = line.match(/(?:^|\s)time=(?:"([^"]+)"|(\S+))/);
  const structuredValue = structuredTime?.[1] ?? structuredTime?.[2];
  if (structuredValue) {
    const parsed = Date.parse(structuredValue);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const trimmed = line.trim();
  if (trimmed.startsWith("{")) {
    try {
      const record = JSON.parse(trimmed) as Record<string, unknown>;
      const value = record.time ?? record.timestamp;
      if (typeof value === "number" && Number.isFinite(value)) {
        return value < 10_000_000_000 ? value * 1_000 : value;
      }
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Fall through to the generic ISO timestamp probe.
    }
  }

  const isoTimestamp = line.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/
  )?.[0];
  if (!isoTimestamp) {
    return null;
  }
  const parsed = Date.parse(isoTimestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

async function discoverDeveloperDiagnosticsArtifacts(
  deps: DeveloperLogsDependencies
): Promise<DeveloperDiagnosticsArtifact[]> {
  const activeManagedLogPaths = new Set([
    deps.defaults.state.tuttidLogPath,
    deps.defaults.state.desktopLogPath
  ]);
  const managedFiles = await listManagedLogFiles(deps.defaults.state.logsDir);
  const appLogFiles = await listWorkspaceAppLogFiles(
    deps.defaults.state.rootDir
  );
  const appFactoryLogFiles = await listAppFactoryLogFiles(
    deps.defaults.state.rootDir
  );
  const agentSessions = await deps.agentSessionsProvider?.().catch(() => []);
  const agentSessionFiles = buildProviderAgentSessionRecordFiles(
    agentSessions ?? []
  );
  const agentSessionUpdatedAtByID = new Map(
    (agentSessions ?? []).map((session) => [
      session.agentSessionID,
      session.updatedAtUnixMS
    ])
  );
  const appCenterSnapshot = await deps
    .appCenterSnapshotProvider?.()
    .catch(() => null);

  const artifacts: DeveloperDiagnosticsArtifact[] = [
    ...managedFiles.map(
      (file): DeveloperDiagnosticsArtifact => ({
        kind: "file",
        category: "managed-log",
        path: file.path,
        archivePath: joinZipPath("logs", basename(file.path)),
        modifiedAtUnixMs: file.modifiedAtUnixMs,
        sizeBytes: file.sizeBytes,
        clearable: true,
        clearMode: activeManagedLogPaths.has(file.path) ? "truncate" : "remove"
      })
    ),
    ...appLogFiles.map(
      (file): DeveloperDiagnosticsArtifact => ({
        kind: "file",
        category: "workspace-app-log",
        path: file.path,
        archivePath: file.archivePath,
        modifiedAtUnixMs: file.modifiedAtUnixMs,
        sizeBytes: file.sizeBytes,
        clearable: true,
        clearMode: "remove"
      })
    ),
    ...appFactoryLogFiles.map(
      (file): DeveloperDiagnosticsArtifact => ({
        kind: "file",
        category: "app-factory-log",
        path: file.path,
        archivePath: file.archivePath,
        modifiedAtUnixMs: file.modifiedAtUnixMs,
        sizeBytes: file.sizeBytes,
        clearable: true,
        clearMode: "remove"
      })
    ),
    ...agentSessionFiles.map(
      (file): DeveloperDiagnosticsArtifact => ({
        kind: "generated",
        category: "agent-session",
        archivePath: file.archivePath,
        content: file.content,
        sizeBytes: file.sizeBytes,
        clearable: false,
        agentSessionID: file.agentSessionID,
        path: file.path,
        provider: file.provider,
        updatedAtUnixMS:
          agentSessionUpdatedAtByID.get(file.agentSessionID) ?? 0,
        workspaceID: file.workspaceID
      })
    )
  ];

  if (appCenterSnapshot) {
    const content = Buffer.from(
      JSON.stringify(appCenterSnapshot, null, 2),
      "utf8"
    );
    artifacts.push({
      kind: "generated",
      category: "app-center-snapshot",
      archivePath: "app-center-snapshot.json",
      content,
      sizeBytes: content.byteLength,
      clearable: false
    });
  }

  return artifacts;
}

function createDefaultDeveloperLogsExportFileName(
  now = new Date(),
  scope: DesktopDeveloperLogsExportScope = "all"
): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rangeSegment = scope === "recent-10-minutes" ? "-last-10-minutes" : "";
  return `tutti-logs${rangeSegment}-${stamp}.zip`;
}

interface BuildRuntimeContextInput {
  defaults: Pick<DesktopResolvedDefaults, "state">;
  desktopVersion: string;
  agentSessionFiles: ExportedAgentSessionFile[];
  logFiles: DiscoveredLogFile[];
  persistedLocale: string | null;
  preferredSystemLanguages: readonly string[] | null;
  systemLocale: string | null;
  transportSnapshot: unknown;
}

function buildRuntimeContext(input: BuildRuntimeContextInput): {
  defaults: Pick<DesktopResolvedDefaults, "state">;
  locale: {
    preferredSystemLanguages: readonly string[];
    persisted: string | null;
    system: string | null;
  };
  logFiles: Array<{
    archivePath: string;
    name: string;
    path: string;
    sizeBytes: number;
  }>;
  agentSessionFiles: Array<{
    agentSessionID: string;
    archivePath: string;
    name: string;
    path: string;
    provider: string;
    sizeBytes: number;
    workspaceID: string;
  }>;
  overrides: Record<string, string>;
  runtime: {
    desktopVersion: string;
    electron: string | undefined;
    tuttiEnv: string | undefined;
    node: string | undefined;
    platform: NodeJS.Platform;
    release: string;
    sessionId: string | undefined;
  };
  transport: unknown;
} {
  return {
    defaults: input.defaults,
    locale: {
      preferredSystemLanguages: input.preferredSystemLanguages ?? [],
      persisted: input.persistedLocale,
      system: input.systemLocale
    },
    logFiles: input.logFiles.map((file) => ({
      archivePath: file.archivePath,
      name: basename(file.path),
      path: file.path,
      sizeBytes: file.sizeBytes
    })),
    agentSessionFiles: input.agentSessionFiles.map((file) => ({
      agentSessionID: file.agentSessionID,
      archivePath: file.archivePath,
      name: basename(file.archivePath),
      path: file.path,
      provider: file.provider,
      sizeBytes: file.sizeBytes,
      workspaceID: file.workspaceID
    })),
    overrides: collectRuntimeOverrides(),
    runtime: {
      desktopVersion: input.desktopVersion,
      electron: process.versions.electron,
      tuttiEnv: process.env.TUTTI_ENV,
      node: process.versions.node,
      platform: process.platform,
      release: process.release.name,
      sessionId: process.env.TUTTI_SESSION_ID
    },
    transport: input.transportSnapshot
  };
}

function collectRuntimeOverrides(): Record<string, string> {
  const supported = [
    "TUTTI_ENV",
    "TUTTI_STATE_DIR",
    "TUTTI_LOG_DIR",
    "TUTTI_LOG_MAX_SIZE_MB",
    "TUTTI_LOG_MAX_BACKUPS",
    "TUTTI_LOG_MAX_AGE_DAYS",
    "TUTTI_LOG_MAX_TOTAL_MB",
    "TUTTID_TRANSPORT",
    "TUTTID_ADDR",
    "TUTTID_SOCKET_PATH",
    "TUTTID_PIPE_PATH",
    "TUTTID_RUN_DIR",
    "TUTTID_DB_PATH",
    "TUTTID_PID_PATH",
    "TUTTID_LOG_PATH",
    "TUTTID_LOG_OUTPUT",
    "TUTTID_LOG_LEVEL",
    "TUTTID_FORWARD_STDIO",
    "TUTTI_DESKTOP_LOG_PATH",
    "TUTTI_DESKTOP_LOG_OUTPUT",
    "TUTTI_DESKTOP_LOG_LEVEL",
    "TUTTI_DESKTOP_USER_DATA_DIR",
    "TUTTI_SESSION_ID"
  ] as const;

  const entries = supported.flatMap((key) => {
    const value = process.env[key];
    return value ? [[key, value] as const] : [];
  });

  return Object.fromEntries(entries);
}

async function summarizeLogFile(
  kind: DesktopDeveloperLogKind,
  path: string
): Promise<DesktopDeveloperLogFileSummary> {
  try {
    const info = await stat(path);
    return {
      exists: true,
      kind,
      path,
      sizeBytes: info.size
    };
  } catch {
    return {
      exists: false,
      kind,
      path,
      sizeBytes: 0
    };
  }
}

async function listManagedLogFiles(logsDir: string): Promise<ManagedLogFile[]> {
  let names: string[];
  try {
    names = await readdir(logsDir);
  } catch {
    return [];
  }

  const files = await Promise.all(
    names.filter(isManagedTuttiLogFileName).map(async (name) => {
      const path = join(logsDir, name);
      try {
        const info = await stat(path);
        if (!info.isFile()) {
          return null;
        }

        return {
          modifiedAtUnixMs: info.mtimeMs,
          path,
          sizeBytes: info.size
        } satisfies ManagedLogFile;
      } catch {
        return null;
      }
    })
  );

  return files.filter((file): file is ManagedLogFile => file !== null);
}

async function listWorkspaceAppLogFiles(
  stateRootDir: string
): Promise<DiscoveredLogFile[]> {
  const appInstallationsDir = join(stateRootDir, "apps", "installations");
  let appEntries: Dirent[];
  try {
    appEntries = await readdir(appInstallationsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const appFiles = await Promise.all(
    appEntries
      .filter((entry) => entry.isDirectory())
      .map(async (appEntry) => {
        const appID = appEntry.name;
        const appDir = join(appInstallationsDir, appID);
        let scopeEntries: Dirent[];
        try {
          scopeEntries = await readdir(appDir, { withFileTypes: true });
        } catch {
          return [];
        }

        const scopeFiles = await Promise.all(
          scopeEntries
            .filter((entry) => entry.isDirectory())
            .map((scopeEntry) =>
              listWorkspaceAppLogDirFiles({
                appID,
                logsDir: join(appDir, scopeEntry.name, "logs"),
                scopeID: scopeEntry.name
              })
            )
        );
        return scopeFiles.flat();
      })
  );

  return appFiles.flat();
}

async function listWorkspaceAppLogDirFiles(input: {
  appID: string;
  logsDir: string;
  scopeID: string;
}): Promise<DiscoveredLogFile[]> {
  const files: DiscoveredLogFile[] = [];
  const pending = [input.logsDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const info = await lstat(path);
        if (!info.isFile()) {
          continue;
        }
        files.push({
          archivePath: joinZipPath(
            "app-logs",
            safeZipPathSegment(input.appID),
            safeZipPathSegment(input.scopeID),
            ...relative(input.logsDir, path)
              .split(/[\\/]+/)
              .map(safeZipPathSegment)
          ),
          modifiedAtUnixMs: info.mtimeMs,
          path,
          sizeBytes: info.size
        });
      } catch {
        continue;
      }
    }
  }

  return files;
}

async function listAppFactoryLogFiles(
  stateRootDir: string
): Promise<DiscoveredLogFile[]> {
  const factoryJobsDir = join(stateRootDir, "apps", "factory", "jobs");
  let jobEntries: Dirent[];
  try {
    jobEntries = await readdir(factoryJobsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const jobFiles = await Promise.all(
    jobEntries
      .filter((entry) => entry.isDirectory())
      .map((jobEntry) =>
        listAppFactoryJobLogDirFiles({
          jobID: jobEntry.name,
          logsDir: join(factoryJobsDir, jobEntry.name, "logs")
        })
      )
  );

  return jobFiles.flat();
}

async function listAppFactoryJobLogDirFiles(input: {
  jobID: string;
  logsDir: string;
}): Promise<DiscoveredLogFile[]> {
  const files: DiscoveredLogFile[] = [];
  const pending = [input.logsDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    let entries: Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const info = await lstat(path);
        if (!info.isFile()) {
          continue;
        }
        files.push({
          archivePath: joinZipPath(
            "app-factory-logs",
            safeZipPathSegment(input.jobID),
            ...relative(input.logsDir, path)
              .split(/[\\/]+/)
              .map(safeZipPathSegment)
          ),
          modifiedAtUnixMs: info.mtimeMs,
          path,
          sizeBytes: info.size
        });
      } catch {
        continue;
      }
    }
  }

  return files;
}

function ensureZipFilePath(filePath: string): string {
  return filePath.toLowerCase().endsWith(".zip") ? filePath : `${filePath}.zip`;
}

function joinZipPath(...parts: string[]): string {
  return parts
    .map((part) => part.replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function isManagedTuttiLogFileName(name: string): boolean {
  const match = /^(.*)\.log$/i.exec(name);
  if (!match) {
    return false;
  }

  const base = (match[1] ?? "").toLowerCase();
  return (
    matchesManagedPrefix(base, managedDesktopLogPrefixes) ||
    matchesManagedPrefix(base, managedDaemonLogPrefixes)
  );
}

function matchesManagedPrefix(base: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => {
    if (base === prefix) {
      return true;
    }

    if (!base.startsWith(`${prefix}.`)) {
      return false;
    }

    const suffix = base.slice(prefix.length + 1);
    return /^\d{4}-\d{2}-\d{2}(?:\.\d+)?$/.test(suffix);
  });
}

function safeZipPathSegment(value: string): string {
  const safe = value.trim().replaceAll(/[^\p{L}\p{N}_.-]/gu, "_");
  if (safe === "" || safe === "." || safe === "..") {
    return "_";
  }
  return safe;
}
