import {
  normalizeAgentActivityDisplayStatus,
  type AgentActivityDisplayStatus
} from "@tutti-os/agent-activity-core";
import {
  MentionPalette,
  flattenMentionPaletteEntries,
  type MentionPaletteEntry,
  type MentionPaletteState,
  type MentionPaletteTheme
} from "@tutti-os/ui-rich-text/at-panel";
import { Spinner } from "../../app/renderer/components/ui/spinner";
import userAvatarPlaceholderUrl from "../../app/renderer/assets/icons/user-avatar-placeholder.png";
import { translate } from "../../i18n/index";
import { cn } from "../../app/renderer/lib/utils";
import { managedAgentRoundedIconUrl } from "../../shared/managedAgentIcons";
import { workspaceAgentActivityStatusLabel } from "../../shared/workspaceAgentActivityStatusLabel";
import { roomIssueStatusLabel } from "../../shared/roomIssueStatusLabel";
import {
  resolveAgentMentionFileThumbnailUrl,
  resolveAgentMentionFileVisualKind
} from "../shared/mentionFilePresentation";
import { Badge, StatusDot } from "@tutti-os/ui-system";
import {
  agentMentionEmptyGroupLabel,
  agentMentionFilterLabel,
  agentMentionGroupLabel
} from "./AgentMentionLabels";
import {
  AGENT_MENTION_FILTER_TAB_ORDER,
  mentionGroupExpandCount
} from "./agentMentionSearchHelpers";
import {
  type AgentMentionGroup,
  type AgentMentionBrowseCategory,
  type AgentMentionFilterId,
  type AgentMentionGroupId,
  type AgentMentionSearchState
} from "./AgentMentionSearchController";
import { agentGeneratedMentionItemKey } from "./agentMentionAgentGeneratedFilesPresentation";
import type { AgentContextMentionItem } from "./agentRichText/agentFileMentionExtension";

export interface AgentMentionPaletteEntry {
  key: string;
  type: "category" | "item" | "expand";
  categoryId?: AgentMentionBrowseCategory["id"];
  groupId?: AgentMentionGroupId;
  item?: AgentContextMentionItem;
}

interface AgentFileMentionPaletteProps {
  state: AgentMentionSearchState;
  highlightedKey: string | null;
  label: string;
  loadingLabel: string;
  emptyLabel: string;
  errorLabel: string;
  tabHintLabel: string;
  maxHeightPx: number;
  shouldCenterHighlightedItem?: boolean;
  onHighlightChange: (key: string) => void;
  onSelectItem: (entry: AgentContextMentionItem) => void;
  onSelectCategory: (categoryId: AgentMentionBrowseCategory["id"]) => void;
  onSelectFilter: (filter: AgentMentionFilterId) => void;
  onExpandGroup: (groupId: AgentMentionGroupId) => void;
  onCycleFilter: () => void;
  onMoveSelection: (delta: 1 | -1) => void;
}

const AGENT_MENTION_PALETTE_THEME: MentionPaletteTheme = {
  classNames: {
    palette: "agent-gui-node__mention-palette",
    header: "agent-gui-node__mention-palette-header",
    footer: "agent-gui-node__mention-palette-footer",
    tabs: "agent-gui-node__mention-palette-tabs",
    scrollRegion: "agent-gui-node__mention-palette-scroll-region",
    scrollbar:
      "workspace-agents-status-panel__scrollbar agent-gui-node__mention-palette-scrollbar",
    scrollbarThumb: "workspace-agents-status-panel__scrollbar-thumb",
    hint: "agent-gui-node__mention-palette-hint",
    hintItem: "agent-gui-node__mention-palette-hint-item",
    hintButton: "agent-gui-node__mention-palette-hint-button",
    hintSeparator: "agent-gui-node__mention-palette-hint-separator",
    shortcut: "agent-gui-node__mention-palette-shortcut",
    shortcutArrow: "agent-gui-node__mention-palette-shortcut--arrow",
    shortcutButton: "agent-gui-node__mention-palette-shortcut-button",
    shortcutGroup: "agent-gui-node__mention-palette-shortcut-group"
  },
  testIds: {
    emptyState: "agent-gui-mention-palette-empty-state",
    hint: "agent-gui-mention-palette-hint",
    scrollbar: "agent-gui-mention-palette-scrollbar",
    loadingSpinner: "agent-mention-loading-spinner"
  },
  groupDividerAttribute: "data-agent-mention-group-divider"
};

/**
 * Stable per-item key suffix. The shared shell composes the full entry key as
 * `${group.id}:${agentMentionItemKey(item)}`, matching the agent's historical
 * `${group.id}:${item.kind}:${...}` format so highlight keys stay compatible.
 */
function agentMentionItemKey(item: AgentContextMentionItem): string {
  return `${item.kind}:${
    item.kind === "file" ? agentGeneratedMentionItemKey(item) : item.targetId
  }`;
}

export function flattenAgentMentionPaletteEntries(
  state: AgentMentionSearchState
): AgentMentionPaletteEntry[] {
  return flattenMentionPaletteEntries(state, (item) =>
    agentMentionItemKey(item)
  ).map((entry: MentionPaletteEntry): AgentMentionPaletteEntry => {
    if (entry.type === "item") {
      const item =
        entry.groupId !== undefined && entry.itemIndex !== undefined
          ? state.groups.find((group) => group.id === entry.groupId)?.items[
              entry.itemIndex
            ]
          : undefined;
      return {
        key: entry.key,
        type: "item",
        groupId: entry.groupId as AgentMentionGroupId | undefined,
        item
      };
    }
    return {
      key: entry.key,
      type: entry.type,
      categoryId: entry.categoryId as AgentMentionFilterId | undefined,
      groupId: entry.groupId as AgentMentionGroupId | undefined
    };
  });
}

export function groupStartKeys(state: AgentMentionSearchState): string[] {
  if (state.mode === "browse") {
    return state.categories.map((category) => `category:${category.id}`);
  }
  return state.groups
    .map((group) => {
      const firstItem = group.items[0];
      if (firstItem) {
        return `${group.id}:${firstItem.kind}:${firstItem.kind === "file" ? firstItem.path : firstItem.targetId}`;
      }
      if (group.hasMore) {
        return `expand:${group.id}`;
      }
      return null;
    })
    .filter((key): key is string => key !== null);
}

export function AgentFileMentionPalette({
  state,
  highlightedKey,
  label,
  loadingLabel,
  emptyLabel,
  errorLabel,
  tabHintLabel,
  maxHeightPx,
  shouldCenterHighlightedItem = false,
  onHighlightChange,
  onSelectItem,
  onSelectCategory,
  onSelectFilter,
  onExpandGroup,
  onCycleFilter,
  onMoveSelection
}: AgentFileMentionPaletteProps): React.JSX.Element {
  "use memo";
  const filter = state.filter as AgentMentionFilterId;
  const highlightedBrowseCategory = highlightedKey?.startsWith("category:")
    ? highlightedKey.slice("category:".length)
    : null;
  const browseDisplayFilter = isBrowseCategoryId(highlightedBrowseCategory)
    ? highlightedBrowseCategory
    : filter;
  const showBrowseHint = shouldShowBrowseSearchHint({
    browseFilter: filter,
    groups: state.groups,
    highlightedBrowseCategory,
    mode: state.mode
  });

  // Browse mode carries its own category list (with labels); results mode tabs
  // are the fixed agent filter order. The shared shell renders a single tab
  // source, so resolve the right one here.
  const categories =
    state.mode === "browse"
      ? state.categories
      : AGENT_MENTION_FILTER_TAB_ORDER.map((id) => ({
          id,
          label: agentMentionFilterLabel(id)
        }));

  // When the agent wants the single keyboard browse hint we hand the shell an
  // empty group list so it renders its (keyboard-icon) empty state with our
  // computed hint copy. Otherwise we map the real groups, decorating each with
  // the agent-specific label / empty / expand / spacing chrome.
  const shellState: MentionPaletteState<AgentContextMentionItem> =
    showBrowseHint
      ? { ...state, categories, groups: [] }
      : {
          ...state,
          categories,
          groups: state.groups.map((group, index) =>
            decorateMentionGroup(
              group,
              index,
              state.groups,
              filter,
              state.query
            )
          )
        };

  const emptyLabelForShell = showBrowseHint
    ? browseHintForFilter(browseDisplayFilter)
    : resolveMentionPaletteEmptyLabel({
        emptyLabel,
        filter,
        mode: state.mode,
        query: state.query
      });

  const showFileSearchMoreHint = shouldShowFileSearchMoreHint({
    filter,
    groups: state.groups,
    mode: state.mode,
    query: state.query
  });

  return (
    <MentionPalette<AgentContextMentionItem>
      state={shellState}
      highlightedKey={highlightedKey}
      getItemKey={agentMentionItemKey}
      renderItem={(item) => renderMentionRow(item)}
      labels={{
        loading: loadingLabel,
        empty: emptyLabelForShell,
        error: errorLabel,
        tabHint: tabHintLabel,
        listbox: label
      }}
      hintLabels={{
        cycleFilter: translate("agentHost.agentGui.fileMentionSwitchCategory"),
        moveSelection: translate(
          "agentHost.agentGui.fileMentionSwitchSelection"
        )
      }}
      maxHeightPx={maxHeightPx}
      scrollHighlightedIntoViewCentered={shouldCenterHighlightedItem}
      loadingBanner={<MentionPaletteLoadingBanner label={loadingLabel} />}
      theme={AGENT_MENTION_PALETTE_THEME}
      renderListFooter={
        showFileSearchMoreHint ? () => <MentionFileSearchMoreHint /> : undefined
      }
      onHighlightChange={onHighlightChange}
      onSelectItem={(item) => onSelectItem(item)}
      onSelectCategory={(categoryId) =>
        onSelectCategory(categoryId as AgentMentionBrowseCategory["id"])
      }
      onSelectFilter={(nextFilter) =>
        onSelectFilter(nextFilter as AgentMentionFilterId)
      }
      onExpandGroup={(groupId) => onExpandGroup(groupId as AgentMentionGroupId)}
      onCycleFilter={() => onCycleFilter()}
      onMoveSelection={onMoveSelection}
    />
  );
}

/**
 * Map a controller group onto the shared shell group, layering in the
 * agent-specific chrome the generic shell intentionally omits: translated
 * group / empty / expand labels, file-search chrome suppression, and the extra
 * top margin between the "my sessions" and "collab sessions" groups.
 */
function decorateMentionGroup(
  group: AgentMentionGroup,
  index: number,
  groups: ReadonlyArray<AgentMentionGroup>,
  filter: AgentMentionFilterId,
  query: string
): AgentMentionGroup {
  const groupId = group.id as AgentMentionGroupId;
  const suppressChrome = shouldSuppressFileSearchGroupChrome(filter, query);
  const followsMySessions =
    groupId === "collab_sessions" &&
    (groups[index - 1]?.id as AgentMentionGroupId) === "my_sessions";
  const showLabel = shouldRenderMentionGroupLabel({
    filter,
    groupCount: groups.length,
    groupId,
    query
  });
  return {
    ...group,
    label: showLabel ? agentMentionGroupLabel(groupId) : undefined,
    emptyLabel: suppressChrome
      ? undefined
      : agentMentionEmptyGroupLabel(groupId, query),
    expandLabel: group.hasMore
      ? translate("agentHost.agentGui.contextPickerExpandMore", {
          count: mentionGroupExpandCount(group, filter)
        })
      : undefined,
    sectionClassName: followsMySessions ? "mt-2" : undefined,
    hideTopDivider: suppressChrome
  };
}

function MentionPaletteLoadingBanner({
  label
}: {
  label: string;
}): React.JSX.Element {
  "use memo";
  return (
    <div
      className="flex items-center gap-2 border-b border-[var(--line-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)]"
      data-testid="agent-mention-loading-banner"
    >
      <Spinner
        size={14}
        className="text-[var(--text-secondary)]"
        testId="agent-mention-loading-spinner"
      />
      <span>{label}</span>
    </div>
  );
}

function MentionFileSearchMoreHint(): React.JSX.Element {
  "use memo";
  return (
    <p
      className="px-3 pb-1 pt-2 text-center text-[13px] leading-5 text-[var(--text-tertiary)]"
      data-agent-mention-file-search-hint="true"
    >
      {translate("agentHost.agentGui.mentionFileSearchMoreHint")}
    </p>
  );
}

function shouldSuppressFileSearchGroupChrome(
  filter: AgentMentionFilterId,
  query: string
): boolean {
  return filter === "file" && query.trim().length > 0;
}

function resolveMentionPaletteEmptyLabel(input: {
  emptyLabel: string;
  filter: AgentMentionFilterId;
  mode: AgentMentionSearchState["mode"];
  query: string;
}): string {
  if (
    input.mode === "results" &&
    input.filter === "file" &&
    input.query.trim().length > 0
  ) {
    return translate("agentHost.agentGui.mentionNoMatchingFiles");
  }
  return input.emptyLabel;
}

function shouldRenderMentionGroupLabel(input: {
  filter: AgentMentionFilterId;
  groupCount: number;
  groupId: AgentMentionGroupId;
  query: string;
}): boolean {
  if (shouldSuppressFileSearchGroupChrome(input.filter, input.query)) {
    return false;
  }
  if (input.filter === "all" || input.groupCount !== 1) {
    return true;
  }
  return (
    agentMentionGroupLabel(input.groupId) !==
    agentMentionFilterLabel(input.filter)
  );
}

function renderMentionRow(item: AgentContextMentionItem): React.JSX.Element {
  if (item.kind === "file") {
    const visualKind = resolveAgentMentionFileVisualKind({
      entryKind: item.entryKind,
      href: item.href,
      mentionNavigation: item.mentionNavigation,
      name: item.name,
      path: item.path
    });
    const childCountLabel =
      item.mentionNavigation === "agent-generated-folder" &&
      typeof item.childCount === "number" &&
      item.childCount > 0
        ? translate("agentHost.agentGui.mentionAgentGeneratedFolderFileCount", {
            count: item.childCount
          })
        : null;
    return (
      <span
        className="flex min-w-0 items-center gap-2"
        data-agent-file-mention="true"
        data-agent-mention-kind="file"
        data-agent-file-entry-kind={item.entryKind}
        data-agent-file-visual-kind={visualKind}
        {...(item.mentionNavigation
          ? { "data-agent-mention-navigation": item.mentionNavigation }
          : {})}
      >
        <MentionFileIcon item={item} visualKind={visualKind} />
        <span className="flex min-w-0 items-baseline gap-1 overflow-hidden">
          <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-primary)]">
            {item.name}
          </span>
          {childCountLabel ? (
            <span className="shrink-0 text-[13px] font-normal text-[var(--text-secondary)]">
              {childCountLabel}
            </span>
          ) : null}
        </span>
      </span>
    );
  }

  if (item.kind === "session") {
    const statusTag = renderSessionMentionStatusTag(item.status);
    return (
      <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          <MentionSessionAvatarStack item={item} />
          <span className="min-w-0 truncate text-[13px] font-semibold leading-[16px] text-[var(--text-primary)]">
            <MentionSessionTitle item={item} />
          </span>
        </span>
        {statusTag}
      </span>
    );
  }

  if (item.kind === "workspace-app") {
    return (
      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
        <MentionWorkspaceAppIcon iconUrl={item.iconUrl} />
        <span className="flex min-w-0 flex-1 items-baseline gap-1 overflow-hidden">
          <span className="min-w-0 max-w-[40%] shrink-0 truncate text-[13px] font-semibold text-[var(--text-primary)]">
            {item.name}
          </span>
          {item.description ? (
            <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-[var(--text-secondary)]">
              {item.description}
            </span>
          ) : null}
        </span>
      </span>
    );
  }

  if (item.kind === "workspace-app-factory") {
    return (
      <span className="grid min-w-0 overflow-hidden gap-1">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-primary)]">
          {item.name}
        </span>
      </span>
    );
  }

  return (
    <span className="grid min-w-0 overflow-hidden gap-1">
      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-primary)]">
          {item.title}
        </span>
        {item.status ? <IssueMentionStatusTag status={item.status} /> : null}
      </span>
      {item.creatorName ? (
        <span className="truncate text-[13px] font-normal text-[var(--text-secondary)]">
          {item.creatorName}
        </span>
      ) : null}
    </span>
  );
}

function MentionFileIcon({
  item,
  visualKind
}: {
  item: Extract<AgentContextMentionItem, { kind: "file" }>;
  visualKind: ReturnType<typeof resolveAgentMentionFileVisualKind>;
}): React.JSX.Element {
  "use memo";
  const thumbnailUrl = resolveAgentMentionFileThumbnailUrl(item);
  if (thumbnailUrl) {
    return (
      <span
        className="agent-gui-node__mention-file-thumb"
        data-agent-mention-file-thumb="true"
        aria-hidden="true"
      >
        <img
          src={thumbnailUrl}
          alt=""
          className="h-full w-full object-cover"
          decoding="async"
          loading="lazy"
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span
      className="agent-gui-node__mention-file-icon"
      data-agent-file-visual-kind={visualKind}
      aria-hidden="true"
    />
  );
}

function MentionWorkspaceAppIcon({
  iconUrl
}: {
  iconUrl?: string | null;
}): React.JSX.Element {
  "use memo";
  const normalizedIconUrl = iconUrl?.trim() ?? "";
  return (
    <span
      className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-[5px] bg-block text-[var(--text-secondary)]"
      data-agent-mention-app-icon="true"
      data-workspace-app-icon="true"
      aria-hidden="true"
    >
      {normalizedIconUrl ? (
        <img
          src={normalizedIconUrl}
          alt=""
          className="h-full w-full object-cover"
          decoding="async"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span className="tsh-agent-object-token__kind-icon h-4 w-4" />
      )}
    </span>
  );
}

function MentionSessionAvatarStack({
  item
}: {
  item: Extract<AgentContextMentionItem, { kind: "session" }>;
}): React.JSX.Element {
  "use memo";
  const userAvatarUrl = item.initiatorAvatarUrl?.trim() ?? "";
  const userImageUrl = userAvatarUrl || userAvatarPlaceholderUrl;
  return (
    <span
      className="relative isolate block h-5 w-9 shrink-0"
      aria-hidden="true"
    >
      <span
        className="absolute left-0 top-0 z-0 grid h-5 w-5 overflow-hidden rounded-full bg-block"
        data-agent-mention-user-avatar="true"
      >
        <img
          src={userImageUrl}
          alt=""
          className={cn(
            "h-full w-full object-cover",
            !userAvatarUrl &&
              "workspace-agents-status-panel__avatar-img--user-placeholder"
          )}
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={(event) => {
            if (event.currentTarget.dataset.fallbackAvatarApplied === "true") {
              return;
            }
            event.currentTarget.dataset.fallbackAvatarApplied = "true";
            event.currentTarget.src = userAvatarPlaceholderUrl;
            event.currentTarget.classList.add(
              "workspace-agents-status-panel__avatar-img--user-placeholder"
            );
          }}
        />
      </span>
      <span
        className="absolute left-4 top-0 z-10 grid h-5 w-5 overflow-hidden rounded-full bg-block"
        data-agent-mention-agent-avatar="true"
      >
        <img
          src={managedAgentRoundedIconUrl(
            mentionSessionAgentProvider(item) ?? item.agentName
          )}
          alt=""
          className="h-full w-full object-cover"
          decoding="async"
          loading="lazy"
          draggable={false}
        />
      </span>
    </span>
  );
}

function mentionSessionAgentProvider(
  item: Extract<AgentContextMentionItem, { kind: "session" }>
): string | null {
  const queryStart = item.href.indexOf("?");
  if (queryStart < 0) {
    return null;
  }
  return new URLSearchParams(item.href.slice(queryStart + 1)).get("provider");
}

function MentionSessionTitle({
  item
}: {
  item: Extract<AgentContextMentionItem, { kind: "session" }>;
}): React.JSX.Element {
  "use memo";
  return (
    <>
      <span className="text-[13px] leading-[16px]">
        {item.initiatorName} & {item.agentName}
      </span>
      <span className="text-[13px] font-normal leading-[16px] text-[var(--text-secondary)]">
        {" "}
        {item.title}
      </span>
    </>
  );
}

function MentionStatusTag({ status }: { status: string }): React.JSX.Element {
  "use memo";
  const activityStatus = normalizeAgentActivityDisplayStatus(status);
  const statusTone = mentionStatusTone(activityStatus);
  const statusLabel = workspaceAgentActivityStatusLabel(activityStatus);
  return (
    <Badge
      variant="secondary"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[4px] px-2 text-[11px] font-semibold leading-none",
        mentionStatusBadgeClassName(activityStatus)
      )}
      data-agent-mention-status-tag="true"
      data-status={activityStatus}
      data-tone={statusTone}
      title={statusLabel}
    >
      <StatusDot
        tone={statusTone}
        pulse={activityStatus === "working" || activityStatus === "waiting"}
        size="xs"
        title={statusLabel}
      />
      <span>{statusLabel}</span>
    </Badge>
  );
}

function renderSessionMentionStatusTag(
  status: string | undefined
): React.JSX.Element | null {
  if (!status) {
    return null;
  }
  const activityStatus = normalizeAgentActivityDisplayStatus(status);
  return <MentionStatusTag status={activityStatus} />;
}

function IssueMentionStatusTag({
  status
}: {
  status: string;
}): React.JSX.Element {
  "use memo";
  const normalizedStatus = status.trim().toLowerCase() || "not_started";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "shrink-0 text-[13px]",
        issueMentionStatusBadgeClassName(status)
      )}
      data-agent-mention-status-tag="true"
      data-status={normalizedStatus}
    >
      {roomIssueStatusLabel(status)}
    </Badge>
  );
}

function mentionStatusTone(
  status: AgentActivityDisplayStatus
): "amber" | "blue" | "green" | "neutral" | "red" {
  if (status === "working") {
    return "blue";
  }
  if (status === "waiting" || status === "canceled") {
    return "amber";
  }
  if (status === "completed" || status === "idle") {
    return "green";
  }
  if (status === "failed") {
    return "red";
  }
  return "neutral";
}

function mentionStatusBadgeClassName(
  status: AgentActivityDisplayStatus
): string {
  if (status === "working") {
    return "bg-sky-500/10 text-sky-700";
  }
  if (status === "waiting" || status === "canceled") {
    return "bg-[color:color-mix(in_srgb,var(--color-amber-500)_12%,transparent)] text-[var(--color-amber-500)]";
  }
  if (status === "completed" || status === "idle") {
    return "bg-[var(--tsh-ui-pill-success-bg)] text-[var(--tsh-ui-pill-success-fg)]";
  }
  if (status === "failed") {
    return "bg-[var(--on-danger)] text-[var(--state-danger)]";
  }
  return "bg-[var(--transparency-block)] text-[var(--text-secondary)]";
}

function issueMentionStatusBadgeClassName(status: string): string {
  switch (status.trim().toLowerCase()) {
    case "completed":
      return "bg-[color:color-mix(in_srgb,var(--state-success)_12%,transparent)] text-[var(--state-success)]";
    case "running":
    case "pending_acceptance":
      return "bg-[var(--transparency-block)] text-[var(--text-secondary)]";
    case "failed":
    case "canceled":
      return "bg-[var(--on-danger)] text-[var(--state-danger)]";
    default:
      return "bg-[var(--transparency-block)] text-[var(--text-secondary)]";
  }
}

function browseHintForFilter(filter: AgentMentionFilterId): string {
  if (filter === "all") {
    return translate("agentHost.agentGui.contextPickerBrowseAllHint");
  }
  switch (filter) {
    case "app":
      return translate("agentHost.agentGui.contextPickerBrowseAppHint");
    case "file":
      return translate("agentHost.agentGui.contextPickerBrowseFileHint");
    case "session":
      return translate("agentHost.agentGui.contextPickerBrowseSessionHint");
    case "issue":
      return translate("agentHost.agentGui.contextPickerBrowseIssueHint");
  }
}

function isBrowseCategoryId(
  value: string | null
): value is AgentMentionFilterId {
  return (
    value === "all" ||
    value === "app" ||
    value === "file" ||
    value === "session" ||
    value === "issue"
  );
}

function hasInteractiveGroupEntries(
  groups: ReadonlyArray<AgentMentionGroup>
): boolean {
  return groups.some((group) => group.items.length > 0 || group.hasMore);
}

function isFileBrowseGroupsOnlyEmpty(
  groups: ReadonlyArray<AgentMentionGroup>
): boolean {
  const fileGroups = groups.filter(
    (group) =>
      group.id === "opened_files" || group.id === "agent_generated_files"
  );
  if (fileGroups.length === 0) {
    return false;
  }
  return fileGroups.every(
    (group) => group.items.length === 0 && !group.hasMore
  );
}

function hasVisibleFileGroupEntries(
  groups: ReadonlyArray<AgentMentionGroup>
): boolean {
  return groups.some(
    (group) =>
      (group.id === "files" ||
        group.id === "opened_files" ||
        group.id === "agent_generated_files") &&
      (group.items.length > 0 || group.hasMore)
  );
}

function shouldShowFileSearchMoreHint(input: {
  filter: AgentMentionFilterId;
  groups: ReadonlyArray<AgentMentionGroup>;
  mode: AgentMentionSearchState["mode"];
  query: string;
}): boolean {
  if (input.filter !== "file" || input.query.trim()) {
    return false;
  }
  if (input.mode !== "browse" && input.mode !== "results") {
    return false;
  }
  return hasVisibleFileGroupEntries(input.groups);
}

function shouldShowBrowseSearchHint(input: {
  browseFilter: AgentMentionFilterId;
  groups: ReadonlyArray<AgentMentionGroup>;
  highlightedBrowseCategory: string | null;
  mode: AgentMentionSearchState["mode"];
}): boolean {
  if (input.mode !== "browse" || hasInteractiveGroupEntries(input.groups)) {
    return false;
  }
  if (input.groups.length === 0) {
    return true;
  }
  if (
    input.highlightedBrowseCategory !== null &&
    input.highlightedBrowseCategory !== input.browseFilter
  ) {
    return true;
  }
  return (
    input.browseFilter === "file" && isFileBrowseGroupsOnlyEmpty(input.groups)
  );
}
