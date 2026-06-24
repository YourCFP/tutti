import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve("src/host/WorkbenchHostDockPopup.tsx"),
  "utf8"
);

test("minimized stack popup cards disappear before restoring", () => {
  assert.match(source, /const dockPopupMinimizedStackLaunchDisappearMs = 0;/);
  assert.match(
    source,
    /const \[isLaunching, setIsLaunching\] = useState\(false\);/
  );
  assert.match(source, /data-launching=\{isLaunching \? "true" : undefined\}/);
  assert.match(
    source,
    /if \(!isMinimizedStack\) \{[\s\S]*?onSelectNode\(item\.node\.id\);/
  );
  assert.match(source, /setIsLaunching\(true\);/);
  assert.match(
    source,
    /setTimeout\(\(\) => \{[\s\S]*?onSelectNode\(item\.node\.id\);[\s\S]*?\}, dockPopupMinimizedStackLaunchDisappearMs\)/
  );
});

test("popup card refs are stable across renders", () => {
  assert.match(source, /const cardRefCallbacksRef = useRef/);
  assert.match(source, /cardRefCallbacksRef\.current\.get\(nodeId\)/);
  assert.match(source, /cardRefCallbacksRef\.current\.set\(nodeId, callback\)/);
  assert.doesNotMatch(
    source,
    /const registerCard = useCallback\(\s*\(nodeId: string\) => \(element: HTMLElement \| null\) =>/
  );
});

test("popup cards render component or image preview states", () => {
  assert.match(source, /WorkbenchHostDockPopupPreviewState/);
  assert.match(source, /status: "loading" \| "fallback"/);
  assert.match(source, /status: "ready"/);
  assert.match(source, /resolveDockPopupItemPreviewState/);
  assert.match(source, /preview\.kind === "component"/);
  assert.match(source, /src=\{preview\.src\}/);
  assert.match(source, /data-preview-state=\{previewState\.status\}/);
  assert.match(source, /bg-transparency-hover/);
  assert.doesNotMatch(source, /dockPopupLoadingPreviewImageUrl/);
  assert.doesNotMatch(source, /dockPopupFallbackPreviewImageUrl/);
});

test("popup card active outline uses the preview corner radius", () => {
  assert.match(source, /data-desktop-dock-popup-card-active-overlay="true"/);
  assert.match(
    source,
    /className="pointer-events-none absolute inset-0 z-\[3\] rounded-md shadow-\[inset_0_0_0_2px_var\(--border-focus\)\]"/
  );
  assert.match(
    source,
    /className=\{cn\(\s*"relative flex min-h-0 min-w-0 flex-1 cursor-pointer flex-col overflow-hidden rounded-md/
  );
});

test("context menu variant renders dock command rows", () => {
  assert.match(source, /WorkbenchHostDockContextMenu/);
  assert.match(source, /data-desktop-dock-context-menu="true"/);
  assert.match(source, /canCreateNew=\{showCreateNew !== false\}/);
  assert.match(source, /onSelectNode\(item\.node\.id\)/);
  assert.match(source, /checked=\{!item\.isMinimized\}/);
  assert.match(source, /newWindowLabel/);
  assert.match(
    source,
    /const hasNewWindowCommand = hasOpenWindows && canCreateNew;/
  );
  assert.match(
    source,
    /const hasDockActionGroup =\s*Boolean\(dockRetention\) \|\| hasNewWindowCommand \|\| hasOpenCommand;/
  );
  assert.match(source, /\{hasNewWindowCommand \? \(/);
  assert.match(source, /const hasOpenWindows = items\.length > 0;/);
  assert.match(source, /label=\{openLabel\}/);
  assert.match(source, /disabled=\{!showOpen\}/);
  assert.match(
    source,
    /dockRetention \? \([\s\S]*?onRunDockRetentionAction[\s\S]*?\) : null\}[\s\S]*?hasNewWindowCommand \? \([\s\S]*?newWindowLabel/
  );
  assert.match(
    source,
    /dockRetention \? \([\s\S]*?onRunDockRetentionAction[\s\S]*?\) : null\}[\s\S]*?hasOpenCommand \? \([\s\S]*?openLabel/
  );
  assert.match(source, /\{hasOpenWindows \? \(/);
  assert.match(
    source,
    /\{hasOpenWindows && \(hasDockActionGroup \|\| hasWindowActionGroup\) \? \([\s\S]*?<WorkbenchHostDockContextMenuSeparator \/>/
  );
  assert.match(
    source,
    /\{hasDockActionGroup \? \([\s\S]*?<WorkbenchHostDockContextMenuSeparator \/>[\s\S]*?\) : null\}/
  );
  assert.match(source, /showAllWindowsLabel/);
  assert.match(
    source,
    /\{canShowAllWindows && onShowAllWindows \? \([\s\S]*?showAllWindowsLabel[\s\S]*?\) : null\}/
  );
  assert.doesNotMatch(
    source,
    /disabled=\{!canShowAllWindows \|\| !onShowAllWindows\}/
  );
  assert.match(source, /fullscreenLabel/);
  assert.match(source, /hideLabel/);
  assert.match(source, /quitLabel/);
  assert.match(source, /dockRetention\.checked/);
  assert.match(source, /checkedIcon=\{[\s\S]*?<PinFilledIcon/);
  assert.match(source, /checked && checkedIcon \? \(/);
  assert.match(source, /MaximizeIcon/);
  assert.match(source, /OverviewLayoutIcon/);
  assert.match(source, /className="size-4 text-\[var\(--tutti-purple\)\]"/);
  assert.match(source, /className="mx-2 my-1 h-px bg-\[var\(--border-1\)\]"/);
  assert.match(source, /isContextMenu \? "p-1" : "p-3"/);
});

test("popup preview memory cache is scoped by dock preview cache identity", () => {
  assert.match(source, /const dockPopupPreviewByMemoryKey = new Map/);
  assert.match(source, /const pendingDockPopupPreviewMemoryKeys = new Set/);
  assert.match(source, /function resolveDockPopupPreviewMemoryKey/);
  assert.match(source, /workspaceId: cacheKey\.workspaceId/);
  assert.match(source, /readDockPopupPreviewImage\(previewMemoryKey\)/);
  assert.match(
    source,
    /pendingDockPopupPreviewMemoryKeys\.has\(previewMemoryKey\)/
  );
  assert.doesNotMatch(source, /readDockPopupPreviewImage\(item\.node\.id\)/);
  assert.doesNotMatch(source, /pendingDockPopupPreviewNodeIDs/);
});
