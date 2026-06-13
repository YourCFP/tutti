# Message Center Attention Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the right-side message center's interactive "needs attention" cards into a single LIFO deck — newest on top, only the top card interactive, and submitting the top card flows to the next interactive card.

**Architecture:** A new `WorkspaceAgentMessageCenterAttentionDeck` component renders the subset of message-center items that have a `pendingPrompt` (interactive) as a stacked deck pinned to the top of the panel, above the existing grouped/filtered list. The deck is fed from `model.items` (unfiltered) so it ignores group-by/filters; the grouped list below is fed from `visibleItems` minus the interactive items. The top card is fully interactive; cards behind it are visual peeks. A short cooldown disables the top card right after the top changes (new card jumps in, or the previous top was answered), preventing mis-clicks.

**Tech Stack:** React 19 (+ React Compiler `"use memo"`), TypeScript, Tailwind, Vitest + Testing Library (jsdom), package `@tutti-os/agent-gui`.

---

## Conventions (read once)

- **Run tests from:** `packages/agent/gui` (the package root). All `vitest`/`tsc` commands below assume that CWD.
- **Single-file test run:** `pnpm exec vitest run --environment jsdom <path-relative-to-package>`
- React Compiler is on; new components/functions that use hooks or are pure render fns start their body with the `"use memo";` directive, matching existing files (see `WorkspaceAgentMessageCenterCard.tsx`).
- Components are exercised via Testing Library; wrap card-only renders in `<TooltipProvider>` (see existing `WorkspaceAgentMessageCenterPanel.spec.tsx`). The full `WorkspaceAgentMessageCenterPanel` provides its own providers.
- Commit after each task with the exact message given. Pre-commit hooks (prettier + boundary checks) run automatically; let them.

## File Structure

- `agent-message-center/workspaceAgentMessageCenterModel.ts` — **modify**: add `isInteractiveMessageCenterItem` predicate + `selectMessageCenterAttentionDeckItems` selector.
- `agent-message-center/workspaceAgentMessageCenterModel.spec.ts` — **modify**: tests for the new predicate/selector.
- `agent-message-center/WorkspaceAgentMessageCenterCard.tsx` — **modify**: add `interactive?: boolean` prop (default `true`) that gates the inline `AgentInteractivePromptSurface`.
- `agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.tsx` — **create**: the deck component.
- `agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx` — **create**: deck unit tests.
- `app/renderer/i18n/locales/en.ts` + `zh-CN.ts` — **modify**: one new key for the "more waiting below" indicator.
- `agent-message-center/WorkspaceAgentMessageCenterPanel.tsx` — **modify**: split items into deck vs list, render the deck above the groups, fix empty-state condition + syncKey.
- `agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx` — **modify**: new panel-level tests + update existing tests that assumed interactive items render inside groups.

---

## Task 1: Model — interactive predicate + deck selector

**Files:**

- Modify: `agent-message-center/workspaceAgentMessageCenterModel.ts`
- Test: `agent-message-center/workspaceAgentMessageCenterModel.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `workspaceAgentMessageCenterModel.spec.ts`. First check its existing imports — it already imports from `./workspaceAgentMessageCenterModel`; add `isInteractiveMessageCenterItem` and `selectMessageCenterAttentionDeckItems` to that import. Then append this `describe` block at the end of the file:

```ts
describe("message center attention deck selection", () => {
  function item(
    overrides: Partial<WorkspaceAgentMessageCenterItem> & {
      agentSessionId: string;
    }
  ): WorkspaceAgentMessageCenterItem {
    return {
      id: `message-center-${overrides.agentSessionId}`,
      agentSessionId: overrides.agentSessionId,
      provider: "codex",
      title: "t",
      identity: null,
      cwd: "/w",
      status: "waiting",
      lastAgentMessageSummary: "",
      lastAgentMessageAtUnixMs: 1,
      pendingPrompt: null,
      needsAttentionKind: null,
      needsAttentionSummary: null,
      sortTimeUnixMs: 1,
      ...overrides
    };
  }
  function withPrompt(
    overrides: Partial<WorkspaceAgentMessageCenterItem> & {
      agentSessionId: string;
    }
  ): WorkspaceAgentMessageCenterItem {
    return item({
      pendingPrompt: {
        kind: "approval",
        id: `approval:${overrides.agentSessionId}`,
        turnId: "turn-1",
        requestId: `request-${overrides.agentSessionId}`,
        callId: `request-${overrides.agentSessionId}`,
        title: "Approval",
        status: "waiting_approval",
        toolName: "Bash",
        input: null,
        options: [],
        output: null,
        occurredAtUnixMs: 1
      },
      ...overrides
    });
  }

  it("treats only items with a pending prompt as interactive", () => {
    expect(
      isInteractiveMessageCenterItem(withPrompt({ agentSessionId: "a" }))
    ).toBe(true);
    expect(
      isInteractiveMessageCenterItem(
        item({ agentSessionId: "b", needsAttentionKind: "input" })
      )
    ).toBe(false);
    expect(isInteractiveMessageCenterItem(item({ agentSessionId: "c" }))).toBe(
      false
    );
  });

  it("selects deck items preserving input order (newest-first as sorted upstream)", () => {
    const newest = withPrompt({ agentSessionId: "newest", sortTimeUnixMs: 30 });
    const older = withPrompt({ agentSessionId: "older", sortTimeUnixMs: 10 });
    const attentionOnly = item({
      agentSessionId: "attn",
      needsAttentionKind: "input"
    });
    const done = item({ agentSessionId: "done", status: "completed" });

    const deck = selectMessageCenterAttentionDeckItems([
      newest,
      older,
      attentionOnly,
      done
    ]);

    expect(deck.map((entry) => entry.agentSessionId)).toEqual([
      "newest",
      "older"
    ]);
  });
});
```

Note: `needsAttentionKind: "input"` — `"input"` is one of the `AgentActivityNeedsAttentionItem["kind"]` values; if the typechecker rejects it, use `"permission"` instead (any non-null kind works for these tests).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/workspaceAgentMessageCenterModel.spec.ts`
Expected: FAIL — `isInteractiveMessageCenterItem is not a function` / `selectMessageCenterAttentionDeckItems is not a function`.

- [ ] **Step 3: Implement the predicate + selector**

In `workspaceAgentMessageCenterModel.ts`, directly below the existing `isWaitingMessageCenterItem` function (ends at the line `}` after `return item.pendingPrompt !== null || item.needsAttentionKind !== null;`), add:

```ts
export function isInteractiveMessageCenterItem(
  item: WorkspaceAgentMessageCenterItem
): boolean {
  return item.pendingPrompt !== null;
}

export function selectMessageCenterAttentionDeckItems(
  items: readonly WorkspaceAgentMessageCenterItem[]
): WorkspaceAgentMessageCenterItem[] {
  return items.filter(isInteractiveMessageCenterItem);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/workspaceAgentMessageCenterModel.spec.ts`
Expected: PASS (all, including the pre-existing model tests in that file).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/agent-message-center/workspaceAgentMessageCenterModel.ts \
        packages/agent/gui/agent-message-center/workspaceAgentMessageCenterModel.spec.ts
git commit -m "feat(message-center): add interactive item predicate and deck selector"
```

---

## Task 2: Card — `interactive` prop gates the prompt surface

**Files:**

- Modify: `agent-message-center/WorkspaceAgentMessageCenterCard.tsx:37-50` (props), `:69` + `:137-151` (render)
- Test: `agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx` (the `WorkspaceAgentMessageCenterCard` describe block)

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("WorkspaceAgentMessageCenterCard", ...)` block in `WorkspaceAgentMessageCenterPanel.spec.tsx`:

```ts
it("hides the interactive prompt surface when interactive is false", () => {
  const promptItem: WorkspaceAgentMessageCenterItem = {
    ...baseItem,
    status: "waiting",
    pendingPrompt: {
      kind: "approval",
      id: "approval:request-1",
      turnId: "turn-1",
      requestId: "request-1",
      callId: "request-1",
      title: "Approval",
      status: "waiting_approval",
      toolName: "Bash",
      input: null,
      options: [
        { id: "allow_once", label: "Yes", kind: "allow_once", description: "" }
      ],
      output: null,
      occurredAtUnixMs: 1
    }
  };

  const { rerender } = render(
    <TooltipProvider>
      <WorkspaceAgentMessageCenterCard
        item={promptItem}
        isSubmitting={false}
        onOpenChat={vi.fn()}
        onSubmitPrompt={vi.fn()}
      />
    </TooltipProvider>
  );
  expect(screen.getByRole("button", { name: "Yes, proceed" })).toBeTruthy();

  rerender(
    <TooltipProvider>
      <WorkspaceAgentMessageCenterCard
        item={promptItem}
        interactive={false}
        isSubmitting={false}
        onOpenChat={vi.fn()}
        onSubmitPrompt={vi.fn()}
      />
    </TooltipProvider>
  );
  expect(screen.queryByRole("button", { name: "Yes, proceed" })).toBeNull();
});
```

(`WorkspaceAgentMessageCenterItem` is already imported in this spec file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx -t "hides the interactive prompt surface"`
Expected: FAIL — the second assertion finds the button because `interactive` is not yet honored (TS may also error that `interactive` is not a known prop).

- [ ] **Step 3: Add the prop and gate the surface**

In `WorkspaceAgentMessageCenterCard.tsx`, add `interactive?: boolean;` to `WorkspaceAgentMessageCenterCardProps` (after `highlighted?: boolean;`):

```ts
export interface WorkspaceAgentMessageCenterCardProps {
  item: WorkspaceAgentMessageCenterItem;
  cardRef?: (node: HTMLElement | null) => void;
  highlighted?: boolean;
  interactive?: boolean;
  isSubmitting: boolean;
  onLinkAction?: (action: WorkspaceLinkAction) => void;
  onOpenChat: (input: { agentSessionId: string; provider: string }) => void;
  onSubmitPrompt: (input: {
    action?: string;
    optionId?: string;
    payload?: Record<string, unknown>;
    requestId: string;
  }) => void;
}
```

Destructure it with a default in the component signature (add `interactive = true,` after `highlighted = false,`):

```ts
export function WorkspaceAgentMessageCenterCard({
  cardRef,
  highlighted = false,
  interactive = true,
  item,
  isSubmitting,
  onLinkAction,
  onOpenChat,
  onSubmitPrompt
}: WorkspaceAgentMessageCenterCardProps): JSX.Element {
```

Change the prompt-surface guard at the `{prompt ? (` block from `prompt ?` to `prompt && interactive ?`:

```tsx
{
  prompt && interactive ? (
    <div className="min-w-0">
      <AgentInteractivePromptSurface
        embedded
        keyboardShortcuts={false}
        prompt={prompt}
        isSubmitting={isSubmitting}
        onSubmit={onSubmitPrompt}
        labels={buildWorkspaceAgentInteractivePromptLabels(t, item.provider)}
      />
    </div>
  ) : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx -t "hides the interactive prompt surface"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterCard.tsx \
        packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx
git commit -m "feat(message-center): gate card prompt surface behind interactive prop"
```

---

## Task 3: i18n — "more waiting below" key

**Files:**

- Modify: `app/renderer/i18n/locales/en.ts`, `app/renderer/i18n/locales/zh-CN.ts`

No test of its own (validated by typecheck + deck tests). `en` is the type source; `zh-CN` must satisfy the same shape, so add the key to both.

- [ ] **Step 1: Add the English key**

In `en.ts`, immediately after the line `workspaceAgentMessageCenterStackSummaryCount: "{{count}} messages",` add:

```ts
    workspaceAgentMessageCenterAttentionDeckRemaining:
      "{{count}} more waiting below",
```

- [ ] **Step 2: Add the Simplified Chinese key**

In `zh-CN.ts`, immediately after the line `workspaceAgentMessageCenterStackSummaryCount: "{{count}} 条消息",` add:

```ts
    workspaceAgentMessageCenterAttentionDeckRemaining: "下方还有 {{count}} 张待处理",
```

- [ ] **Step 3: Verify the locales typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS (no missing-key error between `en` and `zh-CN`). This compiles the whole package; it should already be clean — if there are unrelated pre-existing errors, note them but ensure none reference the i18n locales.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/gui/app/renderer/i18n/locales/en.ts \
        packages/agent/gui/app/renderer/i18n/locales/zh-CN.ts
git commit -m "i18n(message-center): add attention deck remaining-count key"
```

---

## Task 4: Deck component — LIFO order, top interactive, peeks, remaining, highlight-promote

**Files:**

- Create: `agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.tsx`
- Test: `agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`

**Behavior contract for this task:**

- Renders the first item (`items[0]`) as the interactive top card; items `1..2` as non-interactive visual peeks behind it (max 2). The root carries `data-testid="workspace-agent-message-center-attention-deck"`, `data-deck-count={items.length}`, and `data-deck-top-item-id={topItem.id}`.
- A "remaining" indicator shows when `items.length > 1`, using the i18n key from Task 3 with `count = items.length - 1`.
- If `highlightedItemId` matches a non-top item in the deck, that item is promoted to the top slot.
- Empty `items` → renders nothing (returns `null`).
- (Cooldown and animations are added in Tasks 5 and 6.)

- [ ] **Step 1: Write the failing tests**

Create `WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@tutti-os/ui-system";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceAgentMessageCenterAttentionDeck } from "./WorkspaceAgentMessageCenterAttentionDeck";
import type { WorkspaceAgentMessageCenterItem } from "./workspaceAgentMessageCenterModel";

function promptItem(
  overrides: Partial<WorkspaceAgentMessageCenterItem> & {
    agentSessionId: string;
  }
): WorkspaceAgentMessageCenterItem {
  return {
    id: `message-center-${overrides.agentSessionId}`,
    agentSessionId: overrides.agentSessionId,
    provider: "codex",
    title: overrides.agentSessionId,
    identity: null,
    cwd: "/workspace",
    status: "waiting",
    lastAgentMessageSummary: "",
    lastAgentMessageAtUnixMs: 1,
    needsAttentionKind: null,
    needsAttentionSummary: null,
    sortTimeUnixMs: 1,
    pendingPrompt: {
      kind: "approval",
      id: `approval:${overrides.agentSessionId}`,
      turnId: "turn-1",
      requestId: `request-${overrides.agentSessionId}`,
      callId: `request-${overrides.agentSessionId}`,
      title: "Approval",
      status: "waiting_approval",
      toolName: "Bash",
      input: null,
      options: [
        { id: "allow_once", label: "Yes", kind: "allow_once", description: "" }
      ],
      output: null,
      occurredAtUnixMs: 1
    },
    ...overrides
  };
}

function renderDeck(
  items: WorkspaceAgentMessageCenterItem[],
  props: Partial<
    React.ComponentProps<typeof WorkspaceAgentMessageCenterAttentionDeck>
  > = {}
) {
  return render(
    <TooltipProvider>
      <WorkspaceAgentMessageCenterAttentionDeck
        items={items}
        submittingPromptKey={null}
        onSubmitPrompt={vi.fn()}
        onOpenChat={vi.fn()}
        {...props}
      />
    </TooltipProvider>
  );
}

describe("WorkspaceAgentMessageCenterAttentionDeck", () => {
  it("renders nothing when there are no items", () => {
    const { container } = renderDeck([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("puts the first (newest) item on top and only the top card is interactive", () => {
    renderDeck([
      promptItem({ agentSessionId: "newest" }),
      promptItem({ agentSessionId: "older" })
    ]);

    const deck = screen.getByTestId(
      "workspace-agent-message-center-attention-deck"
    );
    expect(deck).toHaveAttribute(
      "data-deck-top-item-id",
      "message-center-newest"
    );
    expect(deck).toHaveAttribute("data-deck-count", "2");
    // exactly one interactive prompt surface (one "Yes, proceed" button)
    expect(
      screen.getAllByRole("button", { name: "Yes, proceed" })
    ).toHaveLength(1);
  });

  it("shows a remaining-count indicator for the cards behind the top", () => {
    renderDeck([
      promptItem({ agentSessionId: "a" }),
      promptItem({ agentSessionId: "b" }),
      promptItem({ agentSessionId: "c" })
    ]);
    expect(screen.getByText("2 more waiting below")).toBeTruthy();
  });

  it("omits the remaining indicator when only one card is present", () => {
    renderDeck([promptItem({ agentSessionId: "solo" })]);
    expect(screen.queryByText(/more waiting below/)).toBeNull();
  });

  it("promotes a highlighted non-top item to the top slot", () => {
    renderDeck(
      [
        promptItem({ agentSessionId: "newest" }),
        promptItem({ agentSessionId: "older" })
      ],
      { highlightedItemId: "message-center-older" }
    );
    const deck = screen.getByTestId(
      "workspace-agent-message-center-attention-deck"
    );
    expect(deck).toHaveAttribute(
      "data-deck-top-item-id",
      "message-center-older"
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`
Expected: FAIL — module `./WorkspaceAgentMessageCenterAttentionDeck` does not exist.

- [ ] **Step 3: Implement the deck component**

Create `WorkspaceAgentMessageCenterAttentionDeck.tsx`:

```tsx
import { useMemo, type JSX } from "react";
import { cn } from "@tutti-os/ui-system";
import { useTranslation } from "../i18n/index";
import type { WorkspaceLinkAction } from "../actions/workspaceLinkActions";
import { WorkspaceAgentMessageCenterCard } from "./WorkspaceAgentMessageCenterCard";
import type { WorkspaceAgentMessageCenterItem } from "./workspaceAgentMessageCenterModel";

const DECK_MAX_PEEK = 2;

export interface WorkspaceAgentMessageCenterAttentionDeckProps {
  items: WorkspaceAgentMessageCenterItem[];
  highlightedItemId?: string | null;
  submittingPromptKey: string | null;
  registerNode?: (itemId: string, node: HTMLElement | null) => void;
  onLinkAction?: (action: WorkspaceLinkAction) => void;
  onOpenChat: (input: { agentSessionId: string; provider: string }) => void;
  onSubmitPrompt: (
    item: WorkspaceAgentMessageCenterItem,
    input: {
      action?: string;
      optionId?: string;
      payload?: Record<string, unknown>;
      requestId: string;
    }
  ) => void;
}

export function WorkspaceAgentMessageCenterAttentionDeck({
  items,
  highlightedItemId = null,
  submittingPromptKey,
  registerNode,
  onLinkAction,
  onOpenChat,
  onSubmitPrompt
}: WorkspaceAgentMessageCenterAttentionDeckProps): JSX.Element | null {
  "use memo";
  const { t } = useTranslation();

  const ordered = useMemo(
    () => orderDeckItems(items, highlightedItemId),
    [items, highlightedItemId]
  );

  const topItem = ordered[0];
  if (!topItem) {
    return null;
  }

  const behindItems = ordered.slice(1, 1 + DECK_MAX_PEEK);
  const remainingCount = ordered.length - 1;
  const topIsSubmitting =
    submittingPromptKey ===
    `${topItem.agentSessionId}:${topItem.pendingPrompt?.requestId}`;

  return (
    <section
      className="flex min-w-0 flex-col gap-2.5"
      aria-label={t("agentHost.workspaceAgentMessageCenterGroupNeedsAttention")}
    >
      <div className="flex min-w-0 items-center justify-between gap-3 px-0.5">
        <h3 className="truncate text-xs font-bold leading-4 text-[var(--text-tertiary)]">
          {t("agentHost.workspaceAgentMessageCenterGroupNeedsAttention")} ·{" "}
          {ordered.length}
        </h3>
      </div>
      <div
        className="relative min-w-0"
        data-testid="workspace-agent-message-center-attention-deck"
        data-deck-count={ordered.length}
        data-deck-top-item-id={topItem.id}
      >
        {behindItems.map((item, peekIndex) => {
          const depth = peekIndex + 1;
          return (
            <div
              key={item.agentSessionId}
              aria-hidden="true"
              inert
              className="pointer-events-none absolute inset-x-0 top-0 min-w-0"
              style={{
                transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.03})`,
                opacity: Math.max(0.55 - peekIndex * 0.2, 0.2),
                zIndex: DECK_MAX_PEEK - peekIndex
              }}
            >
              <WorkspaceAgentMessageCenterCard
                interactive={false}
                isSubmitting={false}
                item={item}
                onOpenChat={onOpenChat}
                onSubmitPrompt={() => {}}
              />
            </div>
          );
        })}
        <div
          className={cn("relative min-w-0", behindItems.length > 0 && "z-10")}
        >
          <WorkspaceAgentMessageCenterCard
            cardRef={
              registerNode
                ? (node) => registerNode(topItem.id, node)
                : undefined
            }
            highlighted={topItem.id === highlightedItemId}
            interactive
            isSubmitting={topIsSubmitting}
            item={topItem}
            onLinkAction={onLinkAction}
            onOpenChat={onOpenChat}
            onSubmitPrompt={(input) => onSubmitPrompt(topItem, input)}
          />
        </div>
      </div>
      {remainingCount > 0 ? (
        <div className="px-0.5 text-xs leading-4 text-[var(--text-tertiary)]">
          {t("agentHost.workspaceAgentMessageCenterAttentionDeckRemaining", {
            count: remainingCount
          })}
        </div>
      ) : null}
    </section>
  );
}

function orderDeckItems(
  items: readonly WorkspaceAgentMessageCenterItem[],
  highlightedItemId: string | null
): WorkspaceAgentMessageCenterItem[] {
  if (!highlightedItemId) {
    return [...items];
  }
  const index = items.findIndex((item) => item.id === highlightedItemId);
  if (index <= 0) {
    return [...items];
  }
  const next = [...items];
  const [picked] = next.splice(index, 1);
  return picked ? [picked, ...next] : next;
}
```

Note on the peek layout: the behind cards are positioned `absolute` while the top card is in normal flow, so the section height is driven by the top card. The behind cards only show their top edge below it because of the `translateY` offset; this matches the approved mockup. Visual fine-tuning (exact offsets) is a manual-verification concern, not a test concern.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.tsx \
        packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx
git commit -m "feat(message-center): add attention deck component"
```

---

## Task 5: Deck — anti-mis-click cooldown when the top changes

**Files:**

- Modify: `agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.tsx`
- Test: `agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`

**Behavior contract:** When the top card's `requestId` changes to a _different_ one (a new card jumps in, or the previous top was answered and the next rises), the new top is briefly non-actionable: its option buttons are disabled for `DECK_NEW_CARD_COOLDOWN_MS` (500ms). No cooldown on first mount (no previous top) and no cooldown when the top is the highlighted (user-driven) item.

- [ ] **Step 1: Write the failing test**

Append to `WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`. Add `act` to the testing-library import (`import { act, render, screen } from "@testing-library/react";`) and `afterEach, beforeEach` to the vitest import.

```tsx
describe("WorkspaceAgentMessageCenterAttentionDeck cooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("does not disable the top option on first mount", () => {
    render(
      <TooltipProvider>
        <WorkspaceAgentMessageCenterAttentionDeck
          items={[promptItem({ agentSessionId: "first" })]}
          submittingPromptKey={null}
          onSubmitPrompt={vi.fn()}
          onOpenChat={vi.fn()}
        />
      </TooltipProvider>
    );
    expect(
      screen.getByRole("button", { name: "Yes, proceed" })
    ).not.toBeDisabled();
  });

  it("disables the new top for the cooldown window, then re-enables it", () => {
    const { rerender } = render(
      <TooltipProvider>
        <WorkspaceAgentMessageCenterAttentionDeck
          items={[promptItem({ agentSessionId: "first" })]}
          submittingPromptKey={null}
          onSubmitPrompt={vi.fn()}
          onOpenChat={vi.fn()}
        />
      </TooltipProvider>
    );

    // A new card jumps to the top.
    rerender(
      <TooltipProvider>
        <WorkspaceAgentMessageCenterAttentionDeck
          items={[
            promptItem({ agentSessionId: "second" }),
            promptItem({ agentSessionId: "first" })
          ]}
          submittingPromptKey={null}
          onSubmitPrompt={vi.fn()}
          onOpenChat={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(
      screen.getAllByRole("button", { name: "Yes, proceed" })[0]
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(
      screen.getAllByRole("button", { name: "Yes, proceed" })[0]
    ).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx -t "cooldown"`
Expected: FAIL — the new top is not disabled (cooldown not implemented yet).

- [ ] **Step 3: Implement the cooldown**

In `WorkspaceAgentMessageCenterAttentionDeck.tsx`:

Update the React import to include the hooks:

```ts
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
```

Add the constant next to `DECK_MAX_PEEK`:

```ts
const DECK_NEW_CARD_COOLDOWN_MS = 500;
```

Inside the component, after `const topItem = ordered[0];` and the `if (!topItem) return null;` guard, add the cooldown state/effect. Compute the top request id and whether the top is the highlighted (user-promoted) card:

```ts
const topRequestId = topItem.pendingPrompt?.requestId ?? null;
const topPromotedByHighlight = topItem.id === highlightedItemId;
const previousTopRequestIdRef = useRef<string | null>(null);
const [cooldownRequestId, setCooldownRequestId] = useState<string | null>(null);

useEffect(() => {
  const previousTopRequestId = previousTopRequestIdRef.current;
  previousTopRequestIdRef.current = topRequestId;
  if (
    !topRequestId ||
    topPromotedByHighlight ||
    previousTopRequestId === null ||
    previousTopRequestId === topRequestId
  ) {
    return undefined;
  }
  setCooldownRequestId(topRequestId);
  const timeoutId = window.setTimeout(() => {
    setCooldownRequestId((current) =>
      current === topRequestId ? null : current
    );
  }, DECK_NEW_CARD_COOLDOWN_MS);
  return () => {
    window.clearTimeout(timeoutId);
  };
}, [topPromotedByHighlight, topRequestId]);

const isTopCoolingDown =
  cooldownRequestId !== null && cooldownRequestId === topRequestId;
```

> Hooks-after-early-return note: `topItem` is guaranteed defined past the `if (!topItem) return null;` guard, but React requires hooks to run unconditionally. Move the `if (!topItem) return null;` guard to **after** these hooks. Concretely: compute `const topItem = ordered[0];` then declare `const topRequestId = ordered[0]?.pendingPrompt?.requestId ?? null;` (use `ordered[0]?.` so it is safe when empty), run the `useRef`/`useState`/`useEffect` hooks, and only then do `if (!topItem) return null;` before the JSX. Reference `topItem` (non-optional) only in code that runs after the guard.

Then change the top card's `isSubmitting` prop to OR in the cooldown:

```tsx
            isSubmitting={topIsSubmitting || isTopCoolingDown}
```

(The card forwards `isSubmitting` to `AgentInteractivePromptSurface`, which disables its option buttons when truthy — so the cooldown disables clicks without hiding the surface or showing a spinner.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`
Expected: PASS (all deck tests, including cooldown).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.tsx \
        packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx
git commit -m "feat(message-center): cooldown the deck top card when it changes"
```

---

## Task 6: Deck — rise-in on new top + fly-away on the answered card

**Files:**

- Modify: `agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.tsx`
- Test: `agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`

**Behavior contract:** When the top item is removed from `items` (e.g. it was answered and the model refreshed), the deck briefly keeps rendering a non-interactive "leaving" ghost of it with a fly-away animation class, then drops it. The new top card carries a rise-in animation class keyed on its id. Animations themselves are CSS (not asserted); the test asserts the leaving-ghost lifecycle. `motion-reduce` users get no animation (Tailwind `motion-safe:`/`motion-reduce:` handles this in CSS).

- [ ] **Step 1: Write the failing test**

Append to `WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`:

```tsx
describe("WorkspaceAgentMessageCenterAttentionDeck transitions", () => {
  it("keeps a leaving ghost of the answered top card until its animation ends", () => {
    const { rerender, container } = render(
      <TooltipProvider>
        <WorkspaceAgentMessageCenterAttentionDeck
          items={[
            promptItem({ agentSessionId: "top" }),
            promptItem({ agentSessionId: "next" })
          ]}
          submittingPromptKey={null}
          onSubmitPrompt={vi.fn()}
          onOpenChat={vi.fn()}
        />
      </TooltipProvider>
    );

    // The top card is answered and removed from the model.
    rerender(
      <TooltipProvider>
        <WorkspaceAgentMessageCenterAttentionDeck
          items={[promptItem({ agentSessionId: "next" })]}
          submittingPromptKey={null}
          onSubmitPrompt={vi.fn()}
          onOpenChat={vi.fn()}
        />
      </TooltipProvider>
    );

    const ghost = container.querySelector(
      '[data-deck-leaving-item-id="message-center-top"]'
    );
    expect(ghost).not.toBeNull();

    // Fire the animation end -> ghost is dropped.
    fireEvent.animationEnd(ghost as Element);
    expect(
      container.querySelector(
        '[data-deck-leaving-item-id="message-center-top"]'
      )
    ).toBeNull();
  });
});
```

Add `fireEvent` to the testing-library import in this spec file: `import { act, fireEvent, render, screen } from "@testing-library/react";`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx -t "leaving ghost"`
Expected: FAIL — no element with `data-deck-leaving-item-id`.

- [ ] **Step 3: Implement leaving ghost + rise-in**

In `WorkspaceAgentMessageCenterAttentionDeck.tsx`:

Add a fallback-timeout constant near the others:

```ts
const DECK_LEAVE_ANIMATION_FALLBACK_MS = 420;
```

Track the previous top item and, when it disappears from `items`, hold it as a leaving ghost. Add this after the cooldown hooks (and after `const topItem = ordered[0];`; use the same "hooks before the `if (!topItem) return null;` guard" rule):

```ts
const previousTopItemRef = useRef<WorkspaceAgentMessageCenterItem | null>(null);
const [leavingItem, setLeavingItem] =
  useState<WorkspaceAgentMessageCenterItem | null>(null);

useEffect(() => {
  const previousTopItem = previousTopItemRef.current;
  previousTopItemRef.current = ordered[0] ?? null;
  if (
    previousTopItem &&
    previousTopItem.id !== (ordered[0]?.id ?? null) &&
    !items.some((item) => item.id === previousTopItem.id)
  ) {
    setLeavingItem(previousTopItem);
    const timeoutId = window.setTimeout(() => {
      setLeavingItem((current) =>
        current?.id === previousTopItem.id ? null : current
      );
    }, DECK_LEAVE_ANIMATION_FALLBACK_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }
  return undefined;
}, [items, ordered]);
```

Render the leaving ghost as an absolutely-positioned overlay on top of the deck (so it visually flies away over the new top). Put this as the **first child** inside the `data-testid="workspace-agent-message-center-attention-deck"` container, before the `behindItems.map(...)`:

```tsx
{
  leavingItem ? (
    <div
      key={`leaving-${leavingItem.agentSessionId}`}
      aria-hidden="true"
      inert
      data-deck-leaving-item-id={leavingItem.id}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 min-w-0 motion-safe:animate-out motion-safe:fade-out-0 motion-safe:slide-out-to-top-2 motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:hidden"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) {
          setLeavingItem((current) =>
            current?.id === leavingItem.id ? null : current
          );
        }
      }}
    >
      <WorkspaceAgentMessageCenterCard
        interactive={false}
        isSubmitting={false}
        item={leavingItem}
        onOpenChat={onOpenChat}
        onSubmitPrompt={() => {}}
      />
    </div>
  ) : null;
}
```

Add the rise-in animation to the top card's wrapper. Change the top-card wrapper `<div>` to key on the top id and include the rise classes:

```tsx
        <div
          key={topItem.id}
          className={cn(
            "relative min-w-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300 motion-reduce:animate-none",
            behindItems.length > 0 && "z-10"
          )}
        >
```

`motion-reduce:hidden` on the ghost means reduced-motion users never see (or `animationEnd`-clear) the ghost; the fallback timeout still clears the state, so no leak.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx`
Expected: PASS (all deck tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.tsx \
        packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterAttentionDeck.spec.tsx
git commit -m "feat(message-center): animate deck card rise-in and fly-away"
```

---

## Task 7: Panel wiring — render the deck above the grouped list

**Files:**

- Modify: `agent-message-center/WorkspaceAgentMessageCenterPanel.tsx`
- Test: `agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx`

**Behavior contract:**

- Items with a `pendingPrompt` are removed from the grouped list and rendered in the deck (pinned at the top, above all groups).
- The deck is fed from `model.items` (unfiltered) so group-by and filters never hide it.
- The grouped list is fed from `visibleItems` minus interactive items.
- Empty-state logic accounts for the deck: if the deck has cards but the list is empty, show the deck (not the "filtered empty" / "no messages" states).

- [ ] **Step 1: Write the failing tests**

Append to the `describe("WorkspaceAgentMessageCenterPanel", ...)` block in `WorkspaceAgentMessageCenterPanel.spec.tsx`:

```ts
it("renders interactive items in the attention deck instead of the groups", () => {
  render(
    <WorkspaceAgentMessageCenterPanel
      open
      model={createMessageCenterModel([
        createWaitingItem({
          agentSessionId: "waiting-session",
          title: "Needs approval"
        }),
        createMessageCenterItem({
          agentSessionId: "working-session",
          title: "Running task",
          status: "working"
        })
      ])}
      onClose={vi.fn()}
      onOpenChat={vi.fn()}
      onSubmitPrompt={vi.fn()}
    />
  );

  const deck = screen.getByTestId(
    "workspace-agent-message-center-attention-deck"
  );
  expect(deck).toHaveAttribute(
    "data-deck-top-item-id",
    "message-center-waiting-session"
  );
  // The interactive item is no longer rendered inside a "Needs attention" group section.
  expect(screen.queryByRole("heading", { name: /Needs attention · / })).toBeNull();
  // Non-interactive items still render in the normal list.
  expect(screen.getByText("Running task")).toBeTruthy();
});

it("keeps the deck visible even when filters would hide the interactive item", () => {
  render(
    <WorkspaceAgentMessageCenterPanel
      open
      model={createMessageCenterModel([
        createWaitingItem({
          agentSessionId: "waiting-session",
          title: "Needs approval"
        }),
        createMessageCenterItem({
          agentSessionId: "working-session",
          title: "Running task",
          status: "working"
        })
      ])}
      onClose={vi.fn()}
      onOpenChat={vi.fn()}
      onSubmitPrompt={vi.fn()}
    />
  );

  // Filter to only "Completed" — removes working item from the list, deck must remain.
  openViewOptions();
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Waiting 1" }));
  fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Running 1" }));
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

  expect(
    screen.getByTestId("workspace-agent-message-center-attention-deck")
  ).toHaveAttribute("data-deck-top-item-id", "message-center-waiting-session");
});

it("advances to the next interactive card after the top one is answered", () => {
  const onSubmitPrompt = vi.fn();
  const model = createMessageCenterModel([
    createWaitingItem({
      agentSessionId: "first",
      title: "Approve first",
      sortTimeUnixMs: 20,
      pendingPrompt: {
        kind: "approval",
        id: "approval:first",
        turnId: "turn-1",
        requestId: "request-first",
        callId: "request-first",
        title: "Approval",
        status: "waiting_approval",
        toolName: "Bash",
        input: null,
        options: [
          { id: "allow_once", label: "Yes", kind: "allow_once", description: "" }
        ],
        output: null,
        occurredAtUnixMs: 20
      }
    }),
    createWaitingItem({
      agentSessionId: "second",
      title: "Approve second",
      sortTimeUnixMs: 10,
      pendingPrompt: {
        kind: "approval",
        id: "approval:second",
        turnId: "turn-1",
        requestId: "request-second",
        callId: "request-second",
        title: "Approval",
        status: "waiting_approval",
        toolName: "Bash",
        input: null,
        options: [
          { id: "allow_once", label: "Yes", kind: "allow_once", description: "" }
        ],
        output: null,
        occurredAtUnixMs: 10
      }
    })
  ]);

  const { rerender } = render(
    <WorkspaceAgentMessageCenterPanel
      open
      model={model}
      onClose={vi.fn()}
      onOpenChat={vi.fn()}
      onSubmitPrompt={onSubmitPrompt}
    />
  );

  // Top is "first"; answer it.
  fireEvent.click(screen.getByRole("button", { name: "Yes, proceed" }));
  expect(onSubmitPrompt).toHaveBeenCalledWith(
    expect.objectContaining({ agentSessionId: "first" })
  );

  // Model refreshes without "first" -> deck advances to "second".
  rerender(
    <WorkspaceAgentMessageCenterPanel
      open
      model={createMessageCenterModel([model.items[1]!])}
      onClose={vi.fn()}
      onOpenChat={vi.fn()}
      onSubmitPrompt={onSubmitPrompt}
    />
  );

  expect(
    screen.getByTestId("workspace-agent-message-center-attention-deck")
  ).toHaveAttribute("data-deck-top-item-id", "message-center-second");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx -t "attention deck"`
Expected: FAIL — no deck element rendered (interactive items still in groups).

- [ ] **Step 3: Wire the deck into the panel**

In `WorkspaceAgentMessageCenterPanel.tsx`:

Add imports — extend the model import to include the helpers, and import the deck:

```ts
import {
  isInteractiveMessageCenterItem,
  selectMessageCenterAttentionDeckItems,
  type WorkspaceAgentMessageCenterItem,
  type WorkspaceAgentMessageCenterModel
} from "./workspaceAgentMessageCenterModel";
import { WorkspaceAgentMessageCenterAttentionDeck } from "./WorkspaceAgentMessageCenterAttentionDeck";
```

After the existing `visibleItems` `useMemo` (ends around line 164), add the deck/list split:

```ts
const deckItems = useMemo(
  () => selectMessageCenterAttentionDeckItems(model.items),
  [model.items]
);
const listItems = useMemo(
  () => visibleItems.filter((item) => !isInteractiveMessageCenterItem(item)),
  [visibleItems]
);
```

Change `itemGroups` to group `listItems` instead of `visibleItems`:

```ts
const itemGroups = useMemo(
  () => groupMessageCenterItems(listItems, groupBy, t),
  [groupBy, t, listItems]
);
```

Update the scroll-area `syncKey` so deck-only changes still resync — replace the `syncKey={...}` on `<AgentVerticalScrollArea>` with:

```tsx
            syncKey={`${groupBy}:${activeStatusSummary}:${[...deckItems, ...visibleItems].map((item) => item.id).join("|")}`}
```

Replace the main content conditional. The current structure is:

```tsx
            {visibleItems.length > 0 ? (
              <div className="flex w-full min-w-0 flex-col gap-4">
                {itemGroups.map((group) => (
                  ...
                ))}
              </div>
            ) : model.items.length > 0 ? (
              ...filtered empty...
            ) : (
              ...empty...
            )}
```

Change the outer condition to `deckItems.length > 0 || listItems.length > 0`, and render the deck as the first child of the flex column, before `itemGroups.map`:

```tsx
            {deckItems.length > 0 || listItems.length > 0 ? (
              <div className="flex w-full min-w-0 flex-col gap-4">
                {deckItems.length > 0 ? (
                  <WorkspaceAgentMessageCenterAttentionDeck
                    items={deckItems}
                    highlightedItemId={highlightedItemId}
                    submittingPromptKey={submittingPromptKey}
                    registerNode={setItemNode}
                    onLinkAction={onLinkAction}
                    onOpenChat={onOpenChat}
                    onSubmitPrompt={(item, input) => void submitPrompt(item, input)}
                  />
                ) : null}
                {itemGroups.map((group) => (
                  <section
                    key={group.id}
                    className="flex min-w-0 flex-col gap-2.5"
                    aria-label={`${group.label} ${group.items.length}`}
                  >
                    {/* ...unchanged group body... */}
                  </section>
                ))}
              </div>
            ) : model.items.length > 0 ? (
              /* ...unchanged filtered-empty branch... */
            ) : (
              /* ...unchanged empty branch... */
            )}
```

Leave the group-rendering body (`renderCard`, `partitionMessageCenterItemsByProvider`, stacks) exactly as-is — only the data feeding it (`listItems` via `itemGroups`) changed. `submitPrompt`, `submittingPromptKey`, `setItemNode`, `onLinkAction`, `onOpenChat` already exist in scope.

> Edge note: the deck's `onSubmitPrompt` is `(item, input) => void`; the existing `submitPrompt(item, input)` matches. The deck computes per-top `isSubmitting` from `submittingPromptKey` internally, so nothing else is needed.

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx -t "attention deck"`
Expected: PASS (the 3 new tests). Existing tests may now fail — that's Task 8.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterPanel.tsx \
        packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx
git commit -m "feat(message-center): pin interactive attention deck above the list"
```

---

## Task 8: Update existing panel tests for the new deck behavior

Moving interactive items into the deck changes two existing assumptions: interactive items no longer appear inside the priority/status "waiting" group. Fix the affected existing tests in `WorkspaceAgentMessageCenterPanel.spec.tsx`.

**Files:**

- Modify: `agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx`

- [ ] **Step 1: Identify the failing existing tests**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx`
Expected: FAIL in tests that put a `createWaitingItem(...)` into the panel and then asserted it appears in a status/priority **group heading**. The known one is **"groups visible message center items by status when selected"** — it asserts `heading "Waiting · 1"`. With the deck, the waiting item is in the deck, so the "Waiting" status group is empty and its heading is absent.

Carefully read the actual failure output; only the assertions about the **waiting group/heading** should change. The **"filters message center items by status from the view menu"** test asserts `screen.getByText("Needs approval")` is visible — that still passes because the deck renders it. Do not change tests that still pass.

- [ ] **Step 2: Update the "groups by status" test**

Replace the body of the `it("groups visible message center items by status when selected", ...)` test so the waiting item is expected in the deck, and the status groups cover only the non-interactive items:

```ts
it("groups visible message center items by status when selected", () => {
  render(
    <WorkspaceAgentMessageCenterPanel
      open
      model={createMessageCenterModel([
        createWaitingItem({
          agentSessionId: "waiting-session",
          title: "Needs approval"
        }),
        createMessageCenterItem({
          agentSessionId: "failed-session",
          title: "Request failed",
          status: "failed"
        }),
        createMessageCenterItem({
          agentSessionId: "working-session",
          title: "Running task",
          status: "working"
        }),
        createMessageCenterItem({
          agentSessionId: "completed-session",
          title: "Done task",
          status: "completed"
        })
      ])}
      onClose={vi.fn()}
      onOpenChat={vi.fn()}
      onSubmitPrompt={vi.fn()}
    />
  );

  openViewOptions();
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Status" }));

  // Interactive waiting item is in the deck, not a status group.
  expect(
    screen.getByTestId("workspace-agent-message-center-attention-deck")
  ).toHaveAttribute("data-deck-top-item-id", "message-center-waiting-session");
  expect(screen.queryByRole("heading", { name: "Waiting · 1" })).toBeNull();

  // Non-interactive items still group by status.
  expect(screen.getByRole("heading", { name: "Error · 1" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Running · 1" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Completed · 1" })).toBeTruthy();
});
```

- [ ] **Step 3: Re-run the full panel spec and fix any remaining fallout**

Run: `pnpm exec vitest run --environment jsdom agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx`
Expected: PASS. If any _other_ existing test fails, it will be because it asserted an interactive item inside a group; update only those assertions to expect the item in the deck (`getByTestId("workspace-agent-message-center-attention-deck")`), keeping the test's intent. Do not weaken unrelated assertions.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/gui/agent-message-center/WorkspaceAgentMessageCenterPanel.spec.tsx
git commit -m "test(message-center): expect interactive items in the deck not groups"
```

---

## Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole package**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: PASS with no new errors. Fix any type errors introduced by the new files/props.

- [ ] **Step 2: Run the whole package test suite**

Run: `pnpm test`
Expected: All test files pass (the prior baseline was green; new tests added by this plan are included).

- [ ] **Step 3: Manual smoke (real app) — record findings**

This is the only check for the animations/visual stacking, which jsdom cannot verify. Launch the app (see the project `run` skill / `pnpm` dev scripts) and open the message center with ≥2 agents awaiting approval. Confirm:

- Newest interactive card is on top; older ones peek behind it.
- Only the top card's options are clickable.
- Answering the top card flies it away and the next rises into the interactive slot.
- A newly-arriving approval jumps to the top and its options are briefly (~0.5s) non-clickable.
- With only non-interactive "needs attention" (e.g. a failed session) and no pending prompt, no deck shows and the list behaves as before.

Record anything off (offset sizes, animation jank) as follow-up notes; only code-level regressions block completion.

- [ ] **Step 4: Final commit (if Step 3 required tweaks)**

```bash
git add -A
git commit -m "polish(message-center): attention deck visual tuning"
```

(Skip if Step 3 needed no changes.)

---

## Self-Review (completed by plan author)

- **Spec coverage:**
  - Req 1 (LIFO, newest on top): Task 1 selector preserves upstream newest-first order; Task 4 renders `items[0]` as top. ✓
  - Req 2 (top interactive only): Task 2 `interactive` prop + Task 4 top-only interactive. ✓
  - Req 3 (flow to next interactive card): Task 6 rise/fly-away + Task 7 advance test. ✓
  - Deck cross-provider merge, pinned above filters/groups: Task 7 (`model.items` unfiltered → deck; `visibleItems` minus interactive → groups). ✓
  - Deck = interactive only (Plan A): Task 1 predicate (`pendingPrompt !== null`). ✓
  - New-card cooldown (Plan 2): Task 5. ✓
  - Highlight promote-to-top: Task 4. ✓
  - Empty/single-card edges: Task 4 (`null` on empty; no indicator on single). ✓
  - Tests for model + panel + deck: Tasks 1,4,5,6,7,8. ✓
- **Placeholder scan:** every code step shows full code; no TBD/TODO. ✓
- **Type consistency:** `isInteractiveMessageCenterItem`/`selectMessageCenterAttentionDeckItems` (Task 1) used verbatim in Tasks 4-jsx? (deck uses them only indirectly) and Task 7. Component name `WorkspaceAgentMessageCenterAttentionDeck` and testid `workspace-agent-message-center-attention-deck` consistent across Tasks 4-8. Prop `interactive` consistent Tasks 2/4. ✓

## Notes / deliberate decisions

- **Header summary unchanged.** `headerSummary` still counts `visibleItems`; the deck is additive. Not worth re-deriving the "filtered" counts for a cosmetic subtitle.
- **No agentactivity.css changes.** Deck visuals use Tailwind utility classes + a couple of inline transforms (mirroring the panel's existing inline `animationDelay` usage). Keeps the change self-contained.
- **`isSubmitting` reuse for cooldown.** The card already forwards `isSubmitting` to the prompt surface, which disables option buttons on truthy. ORing the cooldown into it (Task 5) reuses that path rather than threading a new "disabled" prop through the surface.
