import { memo, useCallback, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@tutti-os/ui-system";
import { BareIconButton } from "@tutti-os/ui-system/components";
import {
  CreateChatIcon,
  FolderIcon,
  FolderOpenLinedIcon,
  MoreHorizontalIcon
} from "@tutti-os/ui-system/icons";
import type { ConversationSection } from "../agentGuiNodeViewConversation";
import styles from "../AgentGUINode.styles";
import type { AgentGUIConversationRailLabels } from "./agentGUIConversationRailLabels";

interface AgentGUIConversationRailSectionHeaderProps {
  batchDeletionDisabled: boolean;
  canCreateConversation: boolean;
  createConversationDisabled: boolean;
  createConversationLabel: string;
  hasProjectPath: boolean;
  isProjectActionLocked: boolean;
  isSectionCollapsed: boolean;
  kind: ConversationSection["kind"];
  labels: AgentGUIConversationRailLabels;
  onCreateConversation: () => void;
  onOpenProjectFiles?: (() => void) | null;
  onProjectDragEnd: () => void;
  onProjectDragOver: (
    edge: "before" | "after",
    event: React.DragEvent<HTMLElement>
  ) => void;
  onProjectDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onProjectDrop: (event: React.DragEvent<HTMLElement>) => void;
  onProjectMenuOpenChange: (open: boolean) => void;
  onRemoveProject: () => void;
  onRequestBatchDeletion: () => void;
  onToggleCollapsed: () => void;
  onToggleProjectPinned: () => void;
  previewMode: boolean;
  projectDragDisabled: boolean;
  projectPinned: boolean;
  sectionLabel: string;
  toggleProjectPinnedDisabled: boolean;
}

export const AgentGUIConversationRailSectionHeader = memo(
  function AgentGUIConversationRailSectionHeader({
    batchDeletionDisabled,
    canCreateConversation,
    createConversationDisabled,
    createConversationLabel,
    hasProjectPath,
    isProjectActionLocked,
    isSectionCollapsed,
    kind,
    labels,
    onCreateConversation,
    onOpenProjectFiles,
    onProjectDragEnd,
    onProjectDragOver,
    onProjectDragStart,
    onProjectDrop,
    onProjectMenuOpenChange,
    onRemoveProject,
    onRequestBatchDeletion,
    onToggleCollapsed,
    onToggleProjectPinned,
    previewMode,
    projectDragDisabled,
    projectPinned,
    sectionLabel,
    toggleProjectPinnedDisabled
  }: AgentGUIConversationRailSectionHeaderProps): React.JSX.Element {
    "use memo";
    const [projectMenuOpen, setProjectMenuOpen] = useState(false);
    const [conversationMenuOpen, setConversationMenuOpen] = useState(false);
    const handleProjectMenuOpenChange = useCallback(
      (open: boolean) => {
        setProjectMenuOpen(open);
        onProjectMenuOpenChange(open);
      },
      [onProjectMenuOpenChange]
    );
    const isProjectSection = kind === "project";

    return (
      <div
        className={styles.conversationSectionHeader}
        draggable={isProjectSection && !projectDragDisabled}
        onDragStart={onProjectDragStart}
        onDragEnd={onProjectDragEnd}
        onDragOver={(event) => {
          if (!isProjectSection) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onProjectDragOver(
            event.clientY < rect.top + rect.height / 2 ? "before" : "after",
            event
          );
        }}
        onDrop={isProjectSection ? onProjectDrop : undefined}
      >
        {isProjectSection ? (
          <button
            type="button"
            className={styles.conversationSectionToggle}
            aria-expanded={!isSectionCollapsed}
            aria-label={
              projectPinned
                ? labels.pinnedProjectAccessibleName(sectionLabel)
                : sectionLabel
            }
            onClick={onToggleCollapsed}
          >
            <ChevronRight
              aria-hidden="true"
              className={styles.conversationSectionChevron}
            />
            <span className={styles.conversationSectionLabel}>
              {isSectionCollapsed ? (
                <FolderIcon
                  aria-hidden="true"
                  className={styles.conversationSectionLabelIcon}
                  data-project-drag-icon="true"
                />
              ) : (
                <FolderOpenLinedIcon
                  aria-hidden="true"
                  className={styles.conversationSectionLabelIcon}
                  data-project-drag-icon="true"
                />
              )}
              <span>{sectionLabel}</span>
            </span>
          </button>
        ) : (
          <div className={styles.conversationSectionToggle}>
            <span className={styles.conversationSectionLabel}>
              <span>{sectionLabel}</span>
            </span>
          </div>
        )}
        {canCreateConversation ? (
          <div
            className={styles.conversationSectionActions}
            data-project-drag-block="true"
          >
            {previewMode ? (
              <span className={styles.conversationSectionActionTooltipWrap}>
                <BareIconButton
                  className={styles.conversationSectionMoreButton}
                  aria-label={createConversationLabel}
                  size="sm"
                  disabled={createConversationDisabled}
                  onClick={onCreateConversation}
                >
                  <CreateChatIcon aria-hidden="true" />
                </BareIconButton>
              </span>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={styles.conversationSectionActionTooltipWrap}>
                    <BareIconButton
                      className={styles.conversationSectionMoreButton}
                      aria-label={createConversationLabel}
                      size="sm"
                      disabled={createConversationDisabled}
                      onClick={onCreateConversation}
                    >
                      <CreateChatIcon aria-hidden="true" />
                    </BareIconButton>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={6}
                  className={styles.conversationSectionActionTooltip}
                >
                  {createConversationLabel}
                </TooltipContent>
              </Tooltip>
            )}
            {hasProjectPath ? (
              <DropdownMenu onOpenChange={handleProjectMenuOpenChange}>
                {previewMode ? (
                  <DropdownMenuTrigger asChild>
                    <span
                      className={styles.conversationSectionActionTooltipWrap}
                    >
                      <BareIconButton
                        className={styles.conversationSectionMoreButton}
                        aria-label={labels.projectSectionMoreActions}
                        size="sm"
                        disabled={isProjectActionLocked}
                      >
                        <MoreHorizontalIcon aria-hidden="true" />
                      </BareIconButton>
                    </span>
                  </DropdownMenuTrigger>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={styles.conversationSectionActionTooltipWrap}
                      >
                        <DropdownMenuTrigger asChild>
                          <BareIconButton
                            className={styles.conversationSectionMoreButton}
                            aria-label={labels.projectSectionMoreActions}
                            size="sm"
                            disabled={isProjectActionLocked}
                          >
                            <MoreHorizontalIcon aria-hidden="true" />
                          </BareIconButton>
                        </DropdownMenuTrigger>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={6}
                      className={styles.conversationSectionActionTooltip}
                    >
                      {labels.projectSectionMoreActions}
                    </TooltipContent>
                  </Tooltip>
                )}
                {projectMenuOpen ? (
                  <DropdownMenuContent
                    align="end"
                    className={`${styles.composerMenuContent} nodrag [-webkit-app-region:no-drag]`}
                    sideOffset={6}
                  >
                    <DropdownMenuItem
                      className={`${styles.composerMenuItem} nodrag [-webkit-app-region:no-drag]`}
                      disabled={!onOpenProjectFiles}
                      onSelect={onOpenProjectFiles ?? undefined}
                    >
                      <span>{labels.projectSectionViewFiles}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={`${styles.composerMenuItem} nodrag [-webkit-app-region:no-drag]`}
                      disabled={toggleProjectPinnedDisabled}
                      onSelect={onToggleProjectPinned}
                    >
                      <span>
                        {projectPinned
                          ? labels.unpinProject
                          : labels.pinProject}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={`${styles.composerMenuItem} nodrag [-webkit-app-region:no-drag]`}
                      disabled={batchDeletionDisabled}
                      onSelect={onRequestBatchDeletion}
                    >
                      <span>{labels.batchDeleteProjectSessions}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className={`${styles.composerMenuItem} nodrag [-webkit-app-region:no-drag]`}
                      disabled={isProjectActionLocked}
                      onSelect={onRemoveProject}
                    >
                      <span>{labels.removeProject}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                ) : null}
              </DropdownMenu>
            ) : null}
            {!hasProjectPath && kind === "conversations" ? (
              <DropdownMenu onOpenChange={setConversationMenuOpen}>
                {previewMode ? (
                  <DropdownMenuTrigger asChild>
                    <span
                      className={styles.conversationSectionActionTooltipWrap}
                    >
                      <BareIconButton
                        className={styles.conversationSectionMoreButton}
                        aria-label={labels.conversationsSectionMoreActions}
                        size="sm"
                      >
                        <MoreHorizontalIcon aria-hidden="true" />
                      </BareIconButton>
                    </span>
                  </DropdownMenuTrigger>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={styles.conversationSectionActionTooltipWrap}
                      >
                        <DropdownMenuTrigger asChild>
                          <BareIconButton
                            className={styles.conversationSectionMoreButton}
                            aria-label={labels.conversationsSectionMoreActions}
                            size="sm"
                          >
                            <MoreHorizontalIcon aria-hidden="true" />
                          </BareIconButton>
                        </DropdownMenuTrigger>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={6}
                      className={styles.conversationSectionActionTooltip}
                    >
                      {labels.conversationsSectionMoreActions}
                    </TooltipContent>
                  </Tooltip>
                )}
                {conversationMenuOpen ? (
                  <DropdownMenuContent
                    align="end"
                    className={`${styles.composerMenuContent} nodrag [-webkit-app-region:no-drag]`}
                    sideOffset={6}
                  >
                    <DropdownMenuItem
                      className={`${styles.composerMenuItem} nodrag [-webkit-app-region:no-drag]`}
                      disabled={batchDeletionDisabled}
                      onSelect={onRequestBatchDeletion}
                    >
                      <span>{labels.batchDeleteConversations}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                ) : null}
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
);
