import type { WorkspaceFileEntry } from "../services/workspaceFileManagerTypes.ts";

export function shouldResolveWorkspaceFileEntryIcon(
  entry: WorkspaceFileEntry
): boolean {
  if (isWorkspaceApplicationBundle(entry)) {
    return true;
  }
  return entry.kind === "file";
}

export function isWorkspaceApplicationBundle(
  entry: Pick<WorkspaceFileEntry, "name">
): boolean {
  return entry.name.trim().toLowerCase().endsWith(".app");
}

export function resolveWorkspaceFileEntryIconCacheKey(
  entry: WorkspaceFileEntry
): string {
  return `${entry.path}:${entry.mtimeMs ?? 0}`;
}
