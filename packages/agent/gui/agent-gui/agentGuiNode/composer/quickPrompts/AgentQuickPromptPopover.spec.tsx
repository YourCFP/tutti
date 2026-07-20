import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@tutti-os/ui-system";
import type { AgentQuickPromptLabels } from "./agentQuickPromptLabels";
import { AgentQuickPromptPopover } from "./AgentQuickPromptPopover";
import type { AgentQuickPromptLibraryController } from "./useAgentQuickPromptLibrary";

const labels = new Proxy(
  {
    deleteDescription: (title: string) => `Delete ${title}`,
    title: "Quick prompts",
    trigger: "Prompts",
    triggerTooltip: "Choose a quick prompt",
    searchPlaceholder: "Search quick prompts",
    add: "New prompt",
    moreActions: "More prompt actions",
    edit: "Edit",
    delete: "Delete",
    empty: "No quick prompts yet",
    noResults: "No matching quick prompts"
  },
  {
    get: (target, property) => Reflect.get(target, property) ?? String(property)
  }
) as AgentQuickPromptLabels;

function controller(
  patch: Partial<AgentQuickPromptLibraryController> = {}
): AgentQuickPromptLibraryController {
  const prompt = {
    id: "prompt-1",
    title: "Review",
    content: "Review the current change",
    version: 1,
    createdAtUnixMs: 1,
    updatedAtUnixMs: 2
  };
  return {
    capabilityAvailable: true,
    close: vi.fn(),
    closeDialog: vi.fn(),
    deletePrompt: vi.fn(),
    filteredPrompts: [prompt],
    isDeleting: false,
    isEditorOpen: false,
    isPopoverOpen: true,
    isSaving: false,
    labels,
    mode: "popover",
    mutationError: null,
    openCreate: vi.fn(),
    openEdit: vi.fn(),
    openPopover: vi.fn(),
    promptToDelete: null,
    retry: vi.fn(),
    saveDraft: vi.fn(async () => true),
    searchQuery: "",
    selectPrompt: vi.fn(),
    selectedPrompt: null,
    setPopoverOpen: vi.fn(),
    setSearchQuery: vi.fn(),
    snapshot: {
      enabled: true,
      status: "ready",
      prompts: [prompt],
      error: null,
      revision: 1,
      pendingMutationIds: []
    },
    submitDelete: vi.fn(async () => true),
    ...patch
  };
}

describe("AgentQuickPromptPopover", () => {
  it("uses the fixed-height Popover and makes only the list a ScrollArea", () => {
    render(
      <TooltipProvider>
        <AgentQuickPromptPopover controller={controller()} disabled={false} />
      </TooltipProvider>
    );

    const surface = document.querySelector('[data-slot="popover-content"]');
    expect(surface).toHaveClass("h-[420px]", "w-[400px]", "overflow-hidden");
    expect(
      screen.getByRole("dialog", { name: "Quick prompts" })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("agent-quick-prompt-scroll-viewport")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Review/u })
    ).toBeInTheDocument();
  });

  it("keeps selection and direct icon management controls as sibling buttons", () => {
    const subject = controller();
    render(
      <TooltipProvider>
        <AgentQuickPromptPopover controller={subject} disabled={false} />
      </TooltipProvider>
    );
    const selection = screen.getByRole("button", { name: /^Review/u });
    expect(selection.querySelector("button")).toBeNull();
    const edit = screen.getByRole("button", { name: "Edit" });
    const remove = screen.getByRole("button", { name: "Delete" });
    expect(edit).toBeInTheDocument();
    expect(remove).toBeInTheDocument();
    fireEvent.pointerDown(edit, { button: 0 });
    expect(subject.openEdit).toHaveBeenCalledOnce();
    fireEvent.pointerDown(remove, { button: 0 });
    expect(subject.deletePrompt).toHaveBeenCalledOnce();
  });

  it("selects a prompt on primary pointer down before the Popover closes", () => {
    const subject = controller();
    render(
      <TooltipProvider>
        <AgentQuickPromptPopover controller={subject} disabled={false} />
      </TooltipProvider>
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: /^Review/u }), {
      button: 0
    });
    expect(subject.selectPrompt).toHaveBeenCalledOnce();
  });

  it("starts creation on primary pointer down so the Dialog survives Popover dismissal", () => {
    const subject = controller();
    render(
      <TooltipProvider>
        <AgentQuickPromptPopover controller={subject} disabled={false} />
      </TooltipProvider>
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "New prompt" }), {
      button: 0
    });
    expect(subject.openCreate).toHaveBeenCalledOnce();
  });

  it("hides the complete entry when the host gate is unavailable", () => {
    const rendered = render(
      <TooltipProvider>
        <AgentQuickPromptPopover
          controller={controller({ capabilityAvailable: false })}
          disabled={false}
        />
      </TooltipProvider>
    );
    expect(rendered.container).toBeEmptyDOMElement();
  });

  it("opens system dialogs for create and destructive confirmation", () => {
    const createRender = render(
      <TooltipProvider>
        <AgentQuickPromptPopover
          controller={controller({
            isEditorOpen: true,
            isPopoverOpen: false,
            mode: "create"
          })}
          disabled={false}
        />
      </TooltipProvider>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(labels.titleLabel)).toBeInTheDocument();
    createRender.unmount();

    const promptToDelete = controller().filteredPrompts[0]!;
    render(
      <TooltipProvider>
        <AgentQuickPromptPopover
          controller={controller({
            isPopoverOpen: false,
            mode: "delete",
            promptToDelete
          })}
          disabled={false}
        />
      </TooltipProvider>
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      labels.deleteDescription(promptToDelete.title)
    );
    expect(
      screen.getByRole("button", { name: labels.deleteConfirm })
    ).toBeInTheDocument();
  });

  it("preserves an edited draft when a conflict refreshes the same prompt", () => {
    const prompt = controller().filteredPrompts[0]!;
    const rendered = render(
      <TooltipProvider>
        <AgentQuickPromptPopover
          controller={controller({
            isEditorOpen: true,
            isPopoverOpen: false,
            mode: "edit",
            selectedPrompt: prompt
          })}
          disabled={false}
        />
      </TooltipProvider>
    );
    const content = screen.getByLabelText(labels.contentLabel);
    fireEvent.change(content, { target: { value: "My unsaved draft" } });

    rendered.rerender(
      <TooltipProvider>
        <AgentQuickPromptPopover
          controller={controller({
            isEditorOpen: true,
            isPopoverOpen: false,
            mode: "edit",
            selectedPrompt: { ...prompt, version: 2, updatedAtUnixMs: 5 }
          })}
          disabled={false}
        />
      </TooltipProvider>
    );
    expect(screen.getByLabelText(labels.contentLabel)).toHaveValue(
      "My unsaved draft"
    );
  });

  it("keeps Enter in the editor Dialog out of the Composer shortcut", () => {
    const onComposerKeyDown = vi.fn();
    render(
      <div onKeyDown={onComposerKeyDown}>
        <TooltipProvider>
          <AgentQuickPromptPopover
            controller={controller({
              isEditorOpen: true,
              isPopoverOpen: false,
              mode: "create"
            })}
            disabled={false}
          />
        </TooltipProvider>
      </div>
    );

    fireEvent.keyDown(screen.getByLabelText(labels.titleLabel), {
      key: "Enter"
    });
    expect(onComposerKeyDown).not.toHaveBeenCalled();
  });
});

describe("quick-prompt UI composition", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "agent-gui/agentGuiNode/composer/quickPrompts/AgentQuickPromptPopover.tsx"
    ),
    "utf8"
  );
  const editorSource = readFileSync(
    join(
      process.cwd(),
      "agent-gui/agentGuiNode/composer/quickPrompts/AgentQuickPromptEditorDialog.tsx"
    ),
    "utf8"
  );

  it("composes only public UI System interaction primitives", () => {
    expect(source).toContain('from "@tutti-os/ui-system"');
    expect(source).toContain('from "@tutti-os/ui-system/icons"');
    expect(source).toContain("<ScrollArea");
    expect(source).toContain("<TooltipProvider");
    expect(source).toMatch(
      /<TooltipTrigger asChild>\s*<span[^>]*>\s*<PopoverTrigger asChild>/u
    );
    expect(source).toContain("<ConfirmationDialog");
    expect(source).toContain("aria-label={labels.edit}");
    expect(source).toContain("aria-label={labels.delete}");
    expect(source).not.toContain("<DropdownMenu");
    expect(source).toContain("onCloseAutoFocus");
    expect(editorSource).toContain("<Dialog");
    expect(editorSource).toContain("<Textarea");
    expect(editorSource).toContain("onKeyDownCapture");
    expect(source).not.toMatch(/<button\b/u);
    expect(editorSource).not.toMatch(/<button\b/u);
    expect(source).not.toContain("radix-ui");
    expect(editorSource).not.toContain("radix-ui");
  });
});
