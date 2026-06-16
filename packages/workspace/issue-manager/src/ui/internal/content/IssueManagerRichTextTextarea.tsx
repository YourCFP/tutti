import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from "react";
import {
  DEFAULT_RICH_TEXT_AT_PANEL_PAGE_SIZE,
  MentionPalette,
  buildMentionPaletteState,
  flattenMentionPaletteEntries,
  type MentionPaletteGroup
} from "@tutti-os/ui-rich-text/at-panel";
import {
  RichTextAtEditor,
  type RichTextAtEditorPanelContext
} from "@tutti-os/ui-rich-text/editor";
import type { RichTextAtQueryMatch } from "@tutti-os/ui-rich-text/types";
import { Button, LinkIcon, cn } from "@tutti-os/ui-system";
import type {
  IssueManagerController,
  IssueManagerRichTextSurface
} from "../../react/index.ts";

const issueManagerRichTextTextareaBaseClassName =
  "min-h-20 w-full rounded-[8px] border border-transparent bg-[var(--transparency-block)] p-3 text-[13px] font-normal leading-[1.3] text-[var(--text-primary)] transition-[background-color,border-color,color] outline-none shadow-none placeholder:text-[var(--text-placeholder)] hover:bg-[var(--transparency-hover)] focus:bg-[var(--transparency-hover)] focus-visible:border-transparent focus-visible:bg-[var(--transparency-hover)] focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-[var(--transparency-block)] disabled:text-[var(--text-disabled)] disabled:opacity-100 aria-invalid:border-[var(--state-danger)] aria-invalid:bg-[var(--transparency-block)] aria-invalid:hover:bg-[var(--transparency-hover)] aria-invalid:focus:bg-[var(--transparency-hover)] aria-invalid:focus-visible:bg-[var(--transparency-hover)] aria-invalid:ring-0 aria-invalid:shadow-none";

const issueManagerRichTextPlaceholderBaseClassName =
  "min-h-20 w-full p-3 text-[13px] font-normal leading-[1.3] text-[var(--text-placeholder)]";

const ISSUE_MANAGER_RICH_AT_PANEL_ENABLED = true;
const ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS = {
  apps: "workspace-app",
  files: "file",
  issues: "workspace-issue",
  sessions: "agent-session"
} as const;

export function IssueManagerRichTextTextarea({
  controller,
  onChange,
  placeholder,
  surface,
  textareaClassName,
  value
}: {
  controller: IssueManagerController;
  onChange: (value: string) => void;
  placeholder?: string;
  surface: IssueManagerRichTextSurface;
  textareaClassName?: string;
  value: string;
}): JSX.Element {
  const providers = useMemo(
    () => controller.resolveRichTextAtProviders(surface),
    [controller, surface]
  );
  const richAtPanelConfig = useMemo(() => {
    const labels = {
      all: controller.copy.t("richTextAt.all"),
      apps: controller.copy.t("richTextAt.apps"),
      files: controller.copy.t("richTextAt.files"),
      issues: controller.copy.t("richTextAt.issues"),
      sessions: controller.copy.t("richTextAt.sessions")
    };
    return {
      filterTabs: [
        { id: "all", label: labels.all },
        { id: "file", label: labels.files },
        { id: "workspace-issue", label: labels.issues },
        { id: "agent-session", label: labels.sessions },
        { id: "workspace-app", label: labels.apps }
      ],
      providerGroups: [
        {
          id: "files",
          label: labels.files,
          providerIds: [ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS.files],
          filterId: ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS.files
        },
        {
          id: "issues",
          label: labels.issues,
          providerIds: [ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS.issues],
          filterId: ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS.issues
        },
        {
          id: "sessions",
          label: labels.sessions,
          providerIds: [ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS.sessions],
          filterId: ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS.sessions
        },
        {
          id: "apps",
          label: labels.apps,
          providerIds: [ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS.apps],
          filterId: ISSUE_MANAGER_RICH_AT_PROVIDER_GROUP_IDS.apps
        }
      ]
    };
  }, [controller.copy]);
  const showReferenceAction = controller.canReferenceWorkspaceFiles;
  const [focusSignal, setFocusSignal] = useState(0);
  const [activeFilterId, setActiveFilterId] = useState<string>(
    richAtPanelConfig.filterTabs[0]?.id ?? "all"
  );
  const [expandedCounts, setExpandedCounts] = useState<
    Record<string, number | undefined>
  >({});
  const expandGroup = useCallback((groupId: string) => {
    setExpandedCounts((current) => ({
      ...current,
      [groupId]:
        (current[groupId] ?? DEFAULT_RICH_TEXT_AT_PANEL_PAGE_SIZE) +
        DEFAULT_RICH_TEXT_AT_PANEL_PAGE_SIZE
    }));
  }, []);
  // Tab/Shift+Tab cycle through every filter tab (including empty ones) with
  // wraparound, matching the agent composer's keyboard behavior.
  const cycleFilter = useCallback(
    (delta: 1 | -1) => {
      const ids = richAtPanelConfig.filterTabs.map((tab) => tab.id);
      if (ids.length === 0) {
        return;
      }
      setActiveFilterId((current) => {
        const index = ids.indexOf(current);
        const base = index >= 0 ? index : delta > 0 ? -1 : 0;
        return ids[(base + delta + ids.length) % ids.length] ?? current;
      });
    },
    [richAtPanelConfig.filterTabs]
  );
  const previousValueRef = useRef(value);
  const wasAddingReferenceRef = useRef(false);

  useEffect(() => {
    const isAddingReference =
      controller.referenceTarget?.mode === "insert" &&
      controller.referenceTarget.parentKind === surface;
    if (
      wasAddingReferenceRef.current &&
      !isAddingReference &&
      value !== previousValueRef.current
    ) {
      setFocusSignal((current) => current + 1);
    }
    wasAddingReferenceRef.current = isAddingReference;
    previousValueRef.current = value;
  }, [controller.referenceTarget, surface, value]);

  return (
    <RichTextAtEditor
      focusSignal={focusSignal}
      maxResults={8}
      minQueryLength={ISSUE_MANAGER_RICH_AT_PANEL_ENABLED ? 0 : 1}
      onCycleFilter={
        ISSUE_MANAGER_RICH_AT_PANEL_ENABLED ? cycleFilter : undefined
      }
      providers={providers}
      textOverrides={{
        loadingLabel: controller.copy.t("richTextAt.loading"),
        noMatchesLabel: controller.copy.t("richTextAt.noMatches"),
        removeReferenceActionLabel: controller.copy.t("actions.removeReference")
      }}
      textareaClassName={cn(
        issueManagerRichTextTextareaBaseClassName,
        textareaClassName,
        showReferenceAction && "pb-11"
      )}
      placeholderClassName={cn(
        issueManagerRichTextPlaceholderBaseClassName,
        textareaClassName,
        showReferenceAction && "pb-11"
      )}
      placeholder={placeholder}
      renderPanel={
        ISSUE_MANAGER_RICH_AT_PANEL_ENABLED
          ? (context) => (
              <IssueManagerMentionPanel
                activeFilterId={activeFilterId}
                context={context}
                controller={controller}
                expandedCounts={expandedCounts}
                filterTabs={richAtPanelConfig.filterTabs}
                providerGroups={richAtPanelConfig.providerGroups}
                onCycleFilter={cycleFilter}
                onExpandGroup={expandGroup}
                onSelectFilter={setActiveFilterId}
              />
            )
          : undefined
      }
      value={value}
      onChange={onChange}
      overlay={
        showReferenceAction ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex">
            <Button
              className="pointer-events-auto"
              size="default"
              type="button"
              variant="secondary"
              onClick={() => {
                void controller.insertReferences(surface);
              }}
            >
              <LinkIcon size={14} />
              {controller.copy.t("actions.referenceWorkspaceFiles")}
            </Button>
          </div>
        ) : null
      }
    />
  );
}

const ISSUE_MANAGER_MENTION_PALETTE_MAX_HEIGHT_PX = 256;

function issueManagerMentionMatchKey(match: RichTextAtQueryMatch): string {
  return `${match.providerId}:${match.key}`;
}

function IssueManagerMentionPanel({
  activeFilterId,
  context,
  controller,
  expandedCounts,
  filterTabs,
  providerGroups,
  onCycleFilter,
  onExpandGroup,
  onSelectFilter
}: {
  activeFilterId: string;
  context: RichTextAtEditorPanelContext;
  controller: IssueManagerController;
  expandedCounts: Record<string, number | undefined>;
  filterTabs: readonly { id: string; label: string }[];
  providerGroups: Parameters<
    typeof buildMentionPaletteState
  >[0]["providerGroups"];
  onCycleFilter: (delta: 1 | -1) => void;
  onExpandGroup: (groupId: string) => void;
  onSelectFilter: (filterId: string) => void;
}): JSX.Element {
  const copy = controller.copy;
  const state = useMemo(
    () =>
      buildMentionPaletteState({
        matches: context.matches,
        providerGroups,
        filterTabs,
        activeFilterId,
        expandedCounts,
        query: context.query.keyword,
        isLoading: context.isLoading,
        showMoreLabel: (count) => copy.t("richTextAt.showMore", { count })
      }),
    [
      activeFilterId,
      context.isLoading,
      context.matches,
      context.query.keyword,
      copy,
      expandedCounts,
      filterTabs,
      providerGroups
    ]
  );

  // Flat, display-ordered item list. This is the single source of truth for
  // both the editor's keyboard navigation order and the highlight bridge below.
  const navigationMatches = useMemo(
    () => state.groups.flatMap((group) => group.items),
    [state.groups]
  );

  // entryKey (`${group.id}:${matchKey}`) → match, so we can map between the
  // shell's highlightedKey and the editor's activeMatch. The entry key strings
  // are produced by the shared `flattenMentionPaletteEntries` util (matching how
  // the agent adapter derives them) rather than re-built inline here.
  const matchByEntryKey = useMemo(() => {
    const map = new Map<string, RichTextAtQueryMatch>();
    for (const entry of flattenMentionPaletteEntries(state, (item) =>
      issueManagerMentionMatchKey(item)
    )) {
      if (
        entry.type !== "item" ||
        entry.groupId === undefined ||
        entry.itemIndex === undefined
      ) {
        continue;
      }
      const item = state.groups.find((group) => group.id === entry.groupId)
        ?.items[entry.itemIndex];
      if (item) {
        map.set(entry.key, item);
      }
    }
    return map;
  }, [state]);

  const entryKeyByMatchKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const [entryKey, match] of matchByEntryKey) {
      map.set(issueManagerMentionMatchKey(match), entryKey);
    }
    return map;
  }, [matchByEntryKey]);

  // Keep the editor's keyboard ↑/↓ order aligned with the displayed list.
  const onNavigationMatchesChange = context.onNavigationMatchesChange;
  useEffect(() => {
    onNavigationMatchesChange(navigationMatches);
  }, [navigationMatches, onNavigationMatchesChange]);
  useEffect(() => {
    return () => {
      onNavigationMatchesChange(null);
    };
  }, [onNavigationMatchesChange]);

  const activeMatch =
    context.activeMatch ?? context.matches[context.activeIndex];
  const highlightedKey = activeMatch
    ? (entryKeyByMatchKey.get(issueManagerMentionMatchKey(activeMatch)) ?? null)
    : null;

  return (
    <MentionPalette<RichTextAtQueryMatch>
      state={state}
      highlightedKey={highlightedKey}
      getItemKey={(item) => issueManagerMentionMatchKey(item)}
      renderItem={(item) => (
        <span className="flex min-w-0 max-w-full items-start gap-2">
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate text-[13px] leading-5 font-medium">
              {item.label}
            </span>
            {item.subtitle ? (
              <span className="truncate text-[11px] leading-4 text-[var(--text-secondary)]">
                {item.subtitle}
              </span>
            ) : null}
          </span>
        </span>
      )}
      labels={{
        loading: copy.t("richTextAt.loading"),
        empty: copy.t("richTextAt.noMatches"),
        error: copy.t("richTextAt.noMatches"),
        tabHint: ""
      }}
      hintLabels={{
        cycleFilter: copy.t("richTextAt.switchCategory"),
        moveSelection: copy.t("richTextAt.switchSelection")
      }}
      maxHeightPx={ISSUE_MANAGER_MENTION_PALETTE_MAX_HEIGHT_PX}
      onHighlightChange={(key) => {
        const match = matchByEntryKey.get(key);
        if (match) {
          context.onActiveMatchChange(match);
        }
      }}
      onSelectItem={(item) => context.onSelect(item)}
      onSelectCategory={(categoryId) => onSelectFilter(categoryId)}
      onSelectFilter={(filterId) => onSelectFilter(filterId)}
      onExpandGroup={(
        groupId: MentionPaletteGroup<RichTextAtQueryMatch>["id"]
      ) => onExpandGroup(groupId)}
      onCycleFilter={onCycleFilter}
      onMoveSelection={context.onMoveSelection}
    />
  );
}
