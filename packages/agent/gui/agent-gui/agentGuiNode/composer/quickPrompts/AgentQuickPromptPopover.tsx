import { useId, useRef } from "react";
import {
  Button,
  ConfirmationDialog,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@tutti-os/ui-system";
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
  FileTextIcon,
  SearchIcon
} from "@tutti-os/ui-system/icons";
import type { AgentHostQuickPrompt } from "../../../../host/agentHostApi";
import { AgentQuickPromptEditorDialog } from "./AgentQuickPromptEditorDialog";
import type { AgentQuickPromptLibraryController } from "./useAgentQuickPromptLibrary";

export function AgentQuickPromptPopover({
  controller,
  disabled
}: {
  controller: AgentQuickPromptLibraryController;
  disabled: boolean;
}): React.JSX.Element | null {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const preserveExternalFocusRef = useRef(false);
  const createRequestedOnPointerDownRef = useRef(false);
  const titleId = useId();
  const { labels, snapshot } = controller;

  if (!controller.capabilityAvailable) {
    return null;
  }

  const focusRow = (index: number): void => {
    const prompt = controller.filteredPrompts[index];
    if (prompt) rowRefs.current.get(prompt.id)?.focus();
  };
  const errorLabel =
    controller.mutationError === "conflict"
      ? labels.conflict
      : controller.mutationError === "generic"
        ? labels.mutationError
        : null;
  const requestCreate = (): void => {
    preserveExternalFocusRef.current = true;
    controller.openCreate();
  };

  return (
    <>
      <Popover
        modal={false}
        open={controller.isPopoverOpen}
        onOpenChange={controller.setPopoverOpen}
      >
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0">
                <PopoverTrigger asChild>
                  <Button
                    aria-label={labels.triggerTooltip}
                    disabled={disabled}
                    size="sm"
                    type="button"
                    variant="chrome"
                  >
                    <FileTextIcon data-icon="inline-start" />
                    <span className="hidden min-[900px]:inline">
                      {labels.trigger}
                    </span>
                  </Button>
                </PopoverTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{labels.triggerTooltip}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <PopoverContent
          aria-labelledby={titleId}
          align="start"
          className="h-[420px] max-h-[var(--radix-popover-content-available-height)] w-[400px] gap-0 overflow-hidden p-0"
          side="top"
          sideOffset={8}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => {
              const selectedId = controller.selectedPrompt?.id;
              const selectedRow = selectedId
                ? rowRefs.current.get(selectedId)
                : null;
              (selectedRow ?? searchRef.current)?.focus();
            });
          }}
          onCloseAutoFocus={(event) => {
            if (preserveExternalFocusRef.current) event.preventDefault();
            preserveExternalFocusRef.current = false;
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-1)] px-3 py-2.5">
            <h2
              id={titleId}
              className="text-[14px] font-medium text-[var(--text-primary)]"
            >
              {labels.title}
            </h2>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                createRequestedOnPointerDownRef.current = true;
                requestCreate();
              }}
              onClick={() => {
                if (createRequestedOnPointerDownRef.current) {
                  createRequestedOnPointerDownRef.current = false;
                  return;
                }
                requestCreate();
              }}
            >
              <AddIcon data-icon="inline-start" />
              {labels.add}
            </Button>
          </div>
          <div className="relative shrink-0 px-3 py-2.5">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
            <Input
              ref={searchRef}
              aria-label={labels.searchPlaceholder}
              className="pl-8"
              placeholder={labels.searchPlaceholder}
              value={controller.searchQuery}
              onChange={(event) =>
                controller.setSearchQuery(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusRow(0);
                }
              }}
            />
          </div>
          {snapshot.status === "error" && snapshot.prompts.length > 0 ? (
            <div
              className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 text-[12px] text-[var(--state-danger)]"
              role="alert"
            >
              <span>{labels.loadError}</span>
              <Button
                size="xs"
                type="button"
                variant="ghost"
                onClick={controller.retry}
              >
                {labels.retry}
              </Button>
            </div>
          ) : null}
          <ScrollArea
            className="min-h-0 flex-1"
            viewportClassName="px-2 pb-2"
            viewportTestId="agent-quick-prompt-scroll-viewport"
          >
            {snapshot.status === "loading" && snapshot.prompts.length === 0 ? (
              <PromptState
                icon={<Spinner size={16} />}
                label={labels.loading}
              />
            ) : snapshot.status === "error" && snapshot.prompts.length === 0 ? (
              <PromptState
                label={labels.loadError}
                action={
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={controller.retry}
                  >
                    {labels.retry}
                  </Button>
                }
              />
            ) : snapshot.prompts.length === 0 ? (
              <PromptState label={labels.empty} />
            ) : controller.filteredPrompts.length === 0 ? (
              <PromptState label={labels.noResults} />
            ) : (
              <div className="flex flex-col gap-0.5">
                {controller.filteredPrompts.map((prompt, index) => (
                  <PromptRow
                    key={prompt.id}
                    prompt={prompt}
                    labels={labels}
                    pending={snapshot.pendingMutationIds.includes(prompt.id)}
                    selectionRef={(node) => {
                      if (node) rowRefs.current.set(prompt.id, node);
                      else rowRefs.current.delete(prompt.id);
                    }}
                    onDelete={() => {
                      preserveExternalFocusRef.current = true;
                      controller.deletePrompt(prompt);
                    }}
                    onEdit={() => {
                      preserveExternalFocusRef.current = true;
                      controller.openEdit(prompt);
                    }}
                    onFocusNext={(offset) =>
                      focusRow(
                        (index + offset + controller.filteredPrompts.length) %
                          controller.filteredPrompts.length
                      )
                    }
                    onSelect={() => {
                      preserveExternalFocusRef.current = true;
                      controller.selectPrompt(prompt);
                    }}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {controller.isEditorOpen ? (
        <AgentQuickPromptEditorDialog controller={controller} />
      ) : null}
      <ConfirmationDialog
        cancelLabel={labels.cancel}
        confirmBusy={controller.isDeleting}
        confirmLabel={
          controller.isDeleting ? labels.deleting : labels.deleteConfirm
        }
        description={
          controller.promptToDelete
            ? labels.deleteDescription(controller.promptToDelete.title)
            : undefined
        }
        onCancel={controller.closeDialog}
        onConfirm={() => void controller.submitDelete()}
        onOpenChange={(open) => {
          if (!open && !controller.isDeleting) controller.closeDialog();
        }}
        open={controller.mode === "delete"}
        title={labels.deleteTitle}
        tone="destructive"
      >
        {errorLabel ? (
          <p className="text-[12px] text-[var(--state-danger)]" role="alert">
            {errorLabel}
          </p>
        ) : null}
      </ConfirmationDialog>
    </>
  );
}

function PromptState({
  action,
  icon,
  label
}: {
  action?: React.ReactNode;
  icon?: React.ReactNode;
  label: string;
}): React.JSX.Element {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-[var(--text-secondary)]">
      {icon}
      <span>{label}</span>
      {action}
    </div>
  );
}

function PromptRow({
  labels,
  onDelete,
  onEdit,
  onFocusNext,
  onSelect,
  pending,
  prompt,
  selectionRef
}: {
  labels: AgentQuickPromptLibraryController["labels"];
  onDelete: () => void;
  onEdit: () => void;
  onFocusNext: (offset: number) => void;
  onSelect: () => void;
  pending: boolean;
  prompt: AgentHostQuickPrompt;
  selectionRef: (node: HTMLButtonElement | null) => void;
}): React.JSX.Element {
  const selectionRequestedOnPointerDownRef = useRef(false);
  const editRequestedOnPointerDownRef = useRef(false);
  const deleteRequestedOnPointerDownRef = useRef(false);

  return (
    <div className="group flex min-w-0 items-start gap-1 rounded-md hover:bg-[var(--transparency-hover)]">
      <Button
        ref={selectionRef}
        className="h-auto min-w-0 flex-1 justify-start px-2 py-2 text-left whitespace-normal hover:bg-transparent"
        disabled={pending}
        type="button"
        variant="ghost"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          selectionRequestedOnPointerDownRef.current = true;
          onSelect();
        }}
        onClick={() => {
          if (selectionRequestedOnPointerDownRef.current) {
            selectionRequestedOnPointerDownRef.current = false;
            return;
          }
          onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            onFocusNext(event.key === "ArrowDown" ? 1 : -1);
          }
        }}
      >
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="w-full truncate font-medium text-[var(--text-primary)]">
            {prompt.title}
          </span>
          <span className="line-clamp-2 w-full text-[12px] leading-[1.35] text-[var(--text-secondary)]">
            {prompt.content}
          </span>
        </span>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={labels.edit}
            className="mt-1.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
            size="icon-sm"
            disabled={pending}
            type="button"
            variant="ghost"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              editRequestedOnPointerDownRef.current = true;
              onEdit();
            }}
            onClick={() => {
              if (editRequestedOnPointerDownRef.current) {
                editRequestedOnPointerDownRef.current = false;
                return;
              }
              onEdit();
            }}
          >
            <EditIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{labels.edit}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={labels.delete}
            className="mt-1.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
            disabled={pending}
            size="icon-sm"
            type="button"
            variant="ghost"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              deleteRequestedOnPointerDownRef.current = true;
              onDelete();
            }}
            onClick={() => {
              if (deleteRequestedOnPointerDownRef.current) {
                deleteRequestedOnPointerDownRef.current = false;
                return;
              }
              onDelete();
            }}
          >
            <DeleteIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{labels.delete}</TooltipContent>
      </Tooltip>
    </div>
  );
}
