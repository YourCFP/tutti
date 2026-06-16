import { Badge, StatusDot, cn } from "@tutti-os/ui-system";
import type {
  MentionRowAppItem,
  MentionRowFileItem,
  MentionRowItem,
  MentionRowSessionItem,
  MentionRowStatusTag
} from "./mentionRowTypes.ts";
import { mentionStatusBadgeClassName } from "./mentionStatusTone.ts";

/**
 * Structural class-name hooks for the elements a {@link MentionRow} renders that
 * rely on a stylesheet (file icon/thumb, the app fallback kind-icon, and the
 * session avatar placeholder modifier). Every key is optional and defaults to a
 * PACKAGE-OWNED `rich-text-at-mention-*` class whose CSS ships with
 * `mentionPalette.css`, so any consumer renders styled rows out of the box.
 *
 * Surfaces with their own stylesheet (e.g. the agent composer) pass their exact
 * existing class names here so their rendered DOM stays byte-identical.
 */
export interface MentionRowClassNames {
  /** The masked file kind-icon `<span>`. */
  fileIcon?: string;
  /** The image-thumbnail wrapper `<span>` (rendered for image files). */
  fileThumb?: string;
  /** The fallback app icon glyph rendered when no `iconUrl` is present. */
  kindIcon?: string;
  /**
   * Modifier class added to the session user avatar `<img>` when the user has no
   * avatar URL and the placeholder asset is shown.
   */
  avatarImgUserPlaceholder?: string;
}

const DEFAULT_MENTION_ROW_CLASS_NAMES = {
  fileIcon: "rich-text-at-mention-file-icon",
  fileThumb: "rich-text-at-mention-file-thumb",
  kindIcon: "rich-text-at-mention-kind-icon",
  avatarImgUserPlaceholder: "rich-text-at-mention-avatar-img--user-placeholder"
} as const satisfies Required<MentionRowClassNames>;

function resolveMentionRowClassNames(
  classNames?: MentionRowClassNames
): Required<MentionRowClassNames> {
  return {
    fileIcon: classNames?.fileIcon ?? DEFAULT_MENTION_ROW_CLASS_NAMES.fileIcon,
    fileThumb:
      classNames?.fileThumb ?? DEFAULT_MENTION_ROW_CLASS_NAMES.fileThumb,
    kindIcon: classNames?.kindIcon ?? DEFAULT_MENTION_ROW_CLASS_NAMES.kindIcon,
    avatarImgUserPlaceholder:
      classNames?.avatarImgUserPlaceholder ??
      DEFAULT_MENTION_ROW_CLASS_NAMES.avatarImgUserPlaceholder
  };
}

/**
 * Render the inner content of a single `@`-mention palette row from a
 * fully-resolved {@link MentionRowItem}. The surrounding option button / active
 * state is provided by the shared `MentionPalette` shell; this renders only the
 * row body. The markup is reproduced verbatim from the agent composer so the
 * DOM/classes stay byte-identical across every mention surface.
 *
 * Pass {@link classNames} to override the package-owned structural class hooks
 * (e.g. so the agent composer keeps emitting its own stylesheet's class names).
 */
export function renderMentionRow(
  item: MentionRowItem,
  classNames?: MentionRowClassNames
): React.ReactNode {
  const resolved = resolveMentionRowClassNames(classNames);
  if (item.kind === "file") {
    return <MentionFileRow item={item} classNames={resolved} />;
  }

  if (item.kind === "session") {
    return (
      <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          <MentionSessionAvatarStack item={item} classNames={resolved} />
          <span className="min-w-0 truncate text-[13px] font-semibold leading-[16px] text-[var(--text-primary)]">
            <MentionSessionTitle item={item} />
          </span>
        </span>
        {item.statusTag ? (
          <MentionStatusBadge statusTag={item.statusTag} />
        ) : null}
      </span>
    );
  }

  if (item.kind === "app") {
    return (
      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
        <MentionWorkspaceAppIcon
          iconUrl={item.iconUrl}
          kindIconClassName={resolved.kindIcon}
        />
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

  if (item.kind === "app-factory") {
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
        {item.statusTag ? (
          <MentionStatusBadge statusTag={item.statusTag} />
        ) : null}
      </span>
      {item.creatorName ? (
        <span className="truncate text-[13px] font-normal text-[var(--text-secondary)]">
          {item.creatorName}
        </span>
      ) : null}
    </span>
  );
}

function MentionFileRow({
  item,
  classNames
}: {
  item: MentionRowFileItem;
  classNames: Required<MentionRowClassNames>;
}): React.JSX.Element {
  return (
    <span
      className="flex min-w-0 items-center gap-2"
      data-agent-file-mention="true"
      data-agent-mention-kind="file"
      {...(item.entryKind
        ? { "data-agent-file-entry-kind": item.entryKind }
        : {})}
      data-agent-file-visual-kind={item.visualKind}
      {...(item.mentionNavigation
        ? { "data-agent-mention-navigation": item.mentionNavigation }
        : {})}
    >
      <MentionFileIcon item={item} classNames={classNames} />
      <span className="flex min-w-0 items-baseline gap-1 overflow-hidden">
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--text-primary)]">
          {item.name}
        </span>
        {item.childCountLabel ? (
          <span className="shrink-0 text-[13px] font-normal text-[var(--text-secondary)]">
            {item.childCountLabel}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function MentionFileIcon({
  item,
  classNames
}: {
  item: MentionRowFileItem;
  classNames: Required<MentionRowClassNames>;
}): React.JSX.Element {
  const thumbnailUrl =
    item.visualKind === "image" ? item.thumbnailUrl?.trim() || "" : "";
  if (thumbnailUrl) {
    return (
      <span
        className={classNames.fileThumb}
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
      className={classNames.fileIcon}
      data-agent-file-visual-kind={item.visualKind}
      aria-hidden="true"
    />
  );
}

function MentionWorkspaceAppIcon({
  iconUrl,
  kindIconClassName
}: {
  iconUrl?: string | null;
  kindIconClassName: string;
}): React.JSX.Element {
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
        <span className={cn(kindIconClassName, "h-4 w-4")} />
      )}
    </span>
  );
}

function MentionSessionAvatarStack({
  item,
  classNames
}: {
  item: MentionRowSessionItem;
  classNames: Required<MentionRowClassNames>;
}): React.JSX.Element {
  const userAvatarUrl = item.userAvatarUrl?.trim() ?? "";
  const placeholderUrl = item.userAvatarPlaceholderUrl;
  const userImageUrl = userAvatarUrl || placeholderUrl;
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
            !userAvatarUrl && classNames.avatarImgUserPlaceholder
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
            event.currentTarget.src = placeholderUrl;
            event.currentTarget.classList.add(
              classNames.avatarImgUserPlaceholder
            );
          }}
        />
      </span>
      <span
        className="absolute left-4 top-0 z-10 grid h-5 w-5 overflow-hidden rounded-full bg-block"
        data-agent-mention-agent-avatar="true"
      >
        <img
          src={item.agentIconUrl}
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

function MentionSessionTitle({
  item
}: {
  item: MentionRowSessionItem;
}): React.JSX.Element {
  return (
    <>
      <span className="text-[13px] leading-[16px]">{item.participant}</span>
      <span className="text-[13px] font-normal leading-[16px] text-[var(--text-secondary)]">
        {" "}
        {item.summary ?? ""}
      </span>
    </>
  );
}

function MentionStatusBadge({
  statusTag
}: {
  statusTag: MentionRowStatusTag;
}): React.JSX.Element {
  if (statusTag.variant === "issue") {
    return (
      <Badge
        variant="secondary"
        className={cn(
          "shrink-0 text-[13px]",
          mentionStatusBadgeClassName({
            tone: statusTag.tone,
            variant: "issue"
          })
        )}
        data-agent-mention-status-tag="true"
        {...(statusTag.dataStatus
          ? { "data-status": statusTag.dataStatus }
          : {})}
      >
        {statusTag.label}
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[4px] px-2 text-[11px] font-semibold leading-none",
        mentionStatusBadgeClassName({
          tone: statusTag.tone,
          variant: "activity"
        })
      )}
      data-agent-mention-status-tag="true"
      {...(statusTag.dataStatus ? { "data-status": statusTag.dataStatus } : {})}
      data-tone={statusTag.tone}
      title={statusTag.label}
    >
      <StatusDot
        tone={statusTag.tone}
        pulse={statusTag.pulse ?? false}
        size="xs"
        title={statusTag.label}
      />
      <span>{statusTag.label}</span>
    </Badge>
  );
}
