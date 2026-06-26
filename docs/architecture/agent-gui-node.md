# AgentGuiNode Architecture and Troubleshooting

Status: living architecture and debugging playbook

Applies to:

- `packages/agent/gui/AgentGUI.tsx`
- `packages/agent/gui/agent-gui/agentGuiNode/**`
- `packages/agent/gui/contexts/workspace/presentation/renderer/agentGuiConversationList/**`
- Agent conversation, composer, approval, interactive prompt, and timeline
  rendering paths in `@tutti-os/agent-gui`

## Why This Exists

AgentGuiNode is a high-linkage UI surface. A local fix in one file can affect
session activation, conversation list projection, message synchronization,
composer state, bottom-dock prompts, approvals, generated file mentions,
provider capability menus, and workspace workbench node state.

Mature teams usually avoid this class of recurring AI-local-fix bugs with four
guardrails:

- a current architecture map that names the source of truth and ownership
  boundaries
- a "before editing" checklist that forces impact analysis before touching a
  local symptom
- focused troubleshooting playbooks for common broken chains
- a lightweight learning loop that turns repeated fixes into durable notes

This document is the AgentGuiNode version of those guardrails.

## Documentation Placement Decision

Use a two-level documentation model:

- `docs/architecture/agent-gui-node.md` is the durable architecture and
  troubleshooting source of truth.
- `packages/agent/gui/README.md` and `packages/agent/gui/AGENTS.md` are entry
  points that route agents and engineers here before changing AgentGUI or
  AgentGuiNode behavior.

Do not put the full architecture only in `AGENTS.md`. Agent instructions are
good for routing, but they are too easy to turn into a long, stale policy file.
Do not keep the only copy under `packages/agent/gui` either. AgentGuiNode spans
desktop adapter input, workbench activation, activity runtime contracts, and
package-local UI, so the enduring architecture belongs in `docs/architecture`.

## Mental Model

AgentGuiNode should be read as a pipeline, not as isolated components:

```text
desktop workbench activation / node state
  -> AgentGUI package boundary
  -> AgentGUINode shell
  -> useAgentGUINodeController
  -> AgentActivityRuntime snapshot and commands
  -> conversation list store and selected session view state
  -> projection helpers
  -> AgentGUINodeView
  -> composer / transcript / approval / prompt UI
```

The main rule is simple: durable agent activity belongs to
`AgentActivityRuntime` and the desktop `WorkspaceAgentActivityService`.
AgentGuiNode may own UI-local state such as selection, draft text, panel
visibility, scroll/loading/error state, temporary optimistic overlays, and
layout preferences.

## Source Of Truth

### Agent Activity Data

`AgentActivityRuntime` is the AgentGUI source for activity data and production
commands. It owns or delegates:

- session list snapshots
- paged session messages
- live event retention and synchronization
- create, activate, unactivate, send input, cancel, interactive response,
  delete, pin, settings update, and composer option operations
- diagnostics through `reportDiagnostic`

Production AgentGUI code should not call legacy `AgentHostApi.workspaceAgents`
or `AgentHostApi.agentSessions` as a list, timeline, message, or write source.
Use the runtime hooks and commands instead.

### Host Capabilities

`AgentHostApi` remains valid for host capabilities that are not the agent
activity data source:

- workspace file references
- clipboard
- runtime metadata and diagnostics outside the activity runtime
- account or user-project lookup
- local file picking, local file reading, and batch export helpers

### Conversation Projection

Projection code converts runtime/session state into renderable view models.
Keep projection deterministic and testable. Prefer pure helpers under
`model/**` and `shared/agentConversation/projection/**` for grouping, sorting,
status selection, and timeline conversion.

### React Components

React components should render snapshots and handle DOM interaction. Avoid
putting cross-step orchestration into component effects when a controller,
store, selector, or pure helper can own it.

## Ownership Map

| Area                                      | Owns                                                                                            | Should not own                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `AgentGUI.tsx`                            | Package-level host provider composition and forwarding node props                               | Session data interpretation                             |
| `AgentGUINode.tsx`                        | Node chrome, package-to-node prop assembly, layout decisions                                    | Runtime data fetching internals                         |
| `controller/useAgentGUINodeController.ts` | UI orchestration, selected conversation flow, runtime command calls, error reporting            | Low-level rendering or durable activity cache ownership |
| `controller/*.ts` helpers                 | Focused controller decisions such as composer, session, interactive, prompt, and error handling | Broad unrelated feature branching                       |
| `model/*.ts`                              | Pure view-model and policy logic                                                                | React effects or host transport                         |
| `AgentGUINodeView.tsx`                    | Concrete UI composition and event wiring from `viewModel` and `actions`                         | Fetching session lists or mutating stores directly      |
| `agentGuiConversationListStore.ts`        | UI-facing conversation list query and local pending overlays                                    | Becoming a second durable activity store                |
| `shared/agentConversation/projection/**`  | Transcript, tool, approval, task, message projection                                            | Provider transport details                              |
| `agentRichText/**`                        | Composer document, mentions, IME, prompt image extraction                                       | Session lifecycle                                       |

## Change Impact Checklist

Before modifying AgentGuiNode or Agent conversation behavior, answer these
questions in the PR, commit notes, or working notes:

1. Which chain is being changed: activation, session list, selected session,
   message timeline, composer draft, submit, cancel, approval, interactive
   prompt, provider capability, generated files, mention resolution, or layout?
2. What is the source of truth for the data being changed?
3. Is the change touching only view rendering, or does it alter runtime command
   sequencing?
4. Does the same state appear in both a durable runtime snapshot and a local
   overlay? If yes, how are conflicts resolved?
5. Which tests prove the changed chain and its nearest neighbor still work?
6. Is this a recurring bug pattern that should update this document or
   `docs/conventions/troubleshooting.md`?

If the answer to source of truth is unclear, stop and trace the chain before
editing.

## Common Chains

### Open Or Activate A Conversation

```text
workbench launch or open-session request
  -> AgentGUI
  -> AgentGUINode
  -> useAgentGUINodeController
  -> selected conversation state
  -> runtime activation or synchronization
  -> conversation detail projection
  -> AgentGUINodeView
```

Check both the request identity and the selected conversation fallback. Bugs in
this path often look like the wrong session opening, a blank detail panel, or a
selected session that is no longer present after refresh.

### Send A Prompt

```text
composer document
  -> prompt content normalization
  -> optional asset upload / mention serialization
  -> runtime send or create-session command
  -> pending local overlay
  -> runtime snapshot refresh and live events
  -> timeline projection
```

Never fix send bugs only in the composer UI. Also inspect the pending overlay,
runtime command input, and timeline merge path.

### Approval Or Ask-User Prompt

```text
runtime messages
  -> timeline projection
  -> prompt view model
  -> AgentInteractivePromptSurface or approval card
  -> runtime submitInteractive
  -> snapshot/message update
```

Check stale prompt IDs, answered prompt filtering, bottom dock state, and
selected conversation synchronization together.

### Composer Settings

```text
provider capability/options
  -> composer support model
  -> node default settings
  -> per-session settings
  -> runtime settings update or draft settings tracking
  -> menu rendering
```

Avoid fixing a menu label or disabled state without checking whether the same
setting is also used by prompt creation, session continuation, and runtime
tracking.

### Mention Or File Reference

```text
rich text document
  -> mention extension
  -> mention palette/search controller
  -> workspace reference adapter or source aggregator
  -> prompt serialization
  -> rendered transcript markdown/link actions
```

IME behavior, search state, serialization, and transcript rendering are separate
links. A local picker fix can break prompt serialization or rendered links.

## Troubleshooting Playbook

### Blank Or Stale Conversation Detail

Quick checks:

- Confirm the selected `agentSessionId` still exists in the runtime snapshot.
- Check whether local deleted or locally created overlays are hiding or
  replacing the runtime conversation.
- Inspect message loading state and `ensureSessionSynchronized` calls.
- Check whether a React mounted ref or cleanup guard is dropping a successful
  async continuation.

Likely fix area:

- selection fallback helper
- conversation list store pending overlay
- session view store loading/error state
- controller synchronization effect

Validation:

```sh
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/controller/useAgentGUINodeController.spec.tsx
```

### Prompt Sends But Timeline Does Not Update

Quick checks:

- Confirm `AgentActivityRuntime.sendInput` or create-session command was called
  with the expected session ID and content blocks.
- Confirm pending overlay messages are inserted and later reconciled.
- Confirm live events or message page reload contains a newer version.
- Inspect timeline item merge and dedupe keys.

Likely fix area:

- prompt content normalization
- pending submit overlay
- message merge helper
- timeline projection

Validation:

```sh
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/controller/useAgentGUINodeController.spec.tsx
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/model/agentGuiConversationModel.spec.ts
```

### Approval Or Question Remains After Answering

Quick checks:

- Confirm the projected prompt status changes after the runtime response.
- Check whether answered/superseded prompts are filtered in both detail and
  bottom-dock surfaces.
- Inspect prompt IDs and turn IDs; local UI IDs must match runtime message
  identity.

Likely fix area:

- interactive projection
- approval projection
- bottom dock prompt selection
- runtime submit response handling

Validation:

```sh
pnpm --filter @tutti-os/agent-gui test -- shared/agentConversation/projection/agentInteractiveProjection.spec.ts
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/controller/useAgentGUINodeController.spec.tsx
```

### Provider Or Capability UI Looks Correct But Submit Uses Old Settings

Quick checks:

- Compare displayed settings with effective composer settings.
- Check node defaults, session settings, draft settings, and runtime options.
- Confirm setting changes call the runtime update or draft tracking method.

Likely fix area:

- `agentGuiController.composerHelpers.ts`
- `composerSettingsSupport.ts`
- `composerSettingsMenuModel.ts`
- controller settings update path

Validation:

```sh
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/controller/agentGuiController.composerHelpers.spec.ts
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/model/composerSettingsMenuModel.spec.ts
```

### Mention Search Or Picker Regresses IME

Quick checks:

- Check `isComposing` handling for Enter, Tab, Arrow keys, and search input.
- Confirm local composing text is not overwritten by async search state.
- Run both mention search and file mention palette tests.

Likely fix area:

- `AgentMentionSearchController.ts`
- `AgentFileMentionPalette.tsx`
- `agentRichText/agentRichTextIme.ts`

Validation:

```sh
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/AgentMentionSearchController.spec.ts
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/AgentFileMentionPalette.spec.tsx
pnpm --filter @tutti-os/agent-gui test -- agent-gui/agentGuiNode/agentRichText/agentRichTextIme.spec.ts
```

## Boundary Checks

Run the runtime boundary check after changing AgentGUI data flow:

```sh
pnpm check:agent-activity-runtime-boundaries
```

Run package tests for focused AgentGUI changes:

```sh
pnpm --filter @tutti-os/agent-gui test
```

Run changed-aware checks before handing off a mixed surface change:

```sh
pnpm check:changed
```

Use broader validation when the change crosses into desktop workbench,
preload/host APIs, or daemon contracts.

## Self-Evolution Loop

Every AgentGuiNode bug fix should end with a short learning check:

1. Did this bug happen because a local fix missed a neighboring chain?
2. Is the root cause likely to recur for another agent or engineer?
3. Is there a stable quick check, invariant, or validation command worth
   repeating?

If yes, ask the user whether to record the lesson. Suggested wording:

> This fix exposed a reusable AgentGuiNode debugging pattern. Should I add it
> to `docs/architecture/agent-gui-node.md` or
> `docs/conventions/troubleshooting.md`?

Record architecture-level lessons here when they explain ownership, data flow,
or invariants. Record narrow recurring bug traps in
`docs/conventions/troubleshooting.md` using that file's entry format.

## What To Avoid

- Do not patch a visible component without tracing the controller and runtime
  chain that feeds it.
- Do not create another durable session cache in AgentGuiNode.
- Do not reintroduce production reads or writes through legacy Host API
  session methods when `AgentActivityRuntime` has the operation.
- Do not hide runtime errors in local UI state without reporting diagnostics.
- Do not solve provider-specific behavior by hardcoding it in generic
  transcript or composer rendering unless the provider identity is part of the
  intended model.
- Do not add broad abstractions to make one bug easier; first use the existing
  controller, model, projection, and store boundaries.

## Related Documents

- [Agent Activity Packages](./agent-activity-packages.md)
- [Agent Reference Mention Resolution](./agent-reference-mention-resolution.md)
- [Agent Reference Source Services](./agent-reference-source-services.md)
- [Desktop Layering](../conventions/desktop-layering.md)
- [Troubleshooting](../conventions/troubleshooting.md)
- [`@tutti-os/agent-gui` README](../../packages/agent/gui/README.md)
