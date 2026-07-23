import type { ReactElement, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WorkspaceFileManagerSession } from "../services/workspaceFileManagerService.interface.ts";
import {
  findWorkspaceFileLocationById,
  isWorkspaceFileExternalLocation,
  isWorkspaceFileRecentLocation
} from "../services/workspaceFileManagerLocations.ts";
import { WorkspaceFileManagerContextMenu } from "./WorkspaceFileManagerContextMenu.tsx";
import { useWorkspaceFileManagerContextMenuView } from "./useWorkspaceFileManagerService.ts";
import type {
  ResolveWorkspaceFileManagerContextMenu,
  WorkspaceFileManagerContextMenuItem,
  WorkspaceFileManagerContextMenuRequest
} from "./workspaceFileManagerContextMenuTypes.ts";
import { resolveWorkspaceFileManagerContextMenuTarget } from "./workspaceFileManagerContextMenuTypes.ts";

export function WorkspaceFileManagerContextMenuContainer({
  resolveContextMenu,
  session
}: {
  resolveContextMenu: ResolveWorkspaceFileManagerContextMenu;
  session: WorkspaceFileManagerSession;
}): ReactElement | null {
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const { view } = useWorkspaceFileManagerContextMenuView(session);
  const [items, setItems] = useState<
    readonly WorkspaceFileManagerContextMenuItem[]
  >([]);

  useLayoutEffect(() => {
    if (!view.contextMenu) {
      setItems([]);
      return;
    }

    const request = buildContextMenuRequest({
      session,
      view
    });
    const resolved = resolveContextMenu(request);
    if (!isPromiseLike(resolved)) {
      setItems(resolved);
      return;
    }

    let cancelled = false;
    setItems([]);
    void resolved.then((nextItems) => {
      if (!cancelled) {
        setItems(nextItems);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    resolveContextMenu,
    session,
    view.contextMenu,
    view.currentDirectoryPath,
    view.isBusy,
    view.isLoading,
    view.isMutating
  ]);

  useCloseContextMenuOnOutsideInteraction({
    contextMenuRef,
    isOpen: view.contextMenu !== null,
    session
  });

  if (!view.contextMenu) {
    return null;
  }

  return (
    <WorkspaceFileManagerContextMenu
      contextMenu={{ x: view.contextMenu.x, y: view.contextMenu.y }}
      contextMenuRef={contextMenuRef}
      items={items}
      onClose={() => {
        session.closeContextMenu();
      }}
    />
  );
}

function buildContextMenuRequest(input: {
  session: WorkspaceFileManagerSession;
  view: {
    contextMenu: {
      entry: Parameters<
        typeof resolveWorkspaceFileManagerContextMenuTarget
      >[0]["entry"];
      x: number;
      y: number;
    } | null;
    currentDirectoryPath: string;
    isBusy: boolean;
    isLoading: boolean;
    isMutating: boolean;
  };
}): WorkspaceFileManagerContextMenuRequest {
  const { session, view } = input;
  const location = findWorkspaceFileLocationById(
    session.store.locationSections,
    session.store.selectedLocationId
  );
  return {
    currentDirectoryPath: view.currentDirectoryPath,
    isBusy: view.isBusy || view.isLoading || view.isMutating,
    isExternalLocation: isWorkspaceFileExternalLocation(location),
    isRecentLocation: isWorkspaceFileRecentLocation(location),
    isSearchMode: session.store.searchQuery.trim().length > 0,
    selectedLocationId: session.store.selectedLocationId,
    target: resolveWorkspaceFileManagerContextMenuTarget({
      currentDirectoryPath: view.currentDirectoryPath,
      entry: view.contextMenu?.entry ?? null
    })
  };
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function useCloseContextMenuOnOutsideInteraction(input: {
  contextMenuRef: RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  session: WorkspaceFileManagerSession;
}): void {
  const { contextMenuRef, isOpen, session } = input;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && contextMenuRef.current?.contains(target)) {
        return;
      }
      if (
        target instanceof Element &&
        target.closest("[data-workspace-file-manager-submenu]")
      ) {
        return;
      }
      session.closeContextMenu();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        session.closeContextMenu();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenuRef, isOpen, session]);
}
