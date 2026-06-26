# AGENTS.md

## Scope

This file applies to `packages/agent/gui/*`.

Read the repository root `AGENTS.md` and `packages/AGENTS.md` first. This file
adds AgentGUI-specific guardrails.

## Required Reading

Before editing AgentGUI, AgentGuiNode, or the agent conversation module, read:

- [docs/architecture/agent-gui-node.md](../../../docs/architecture/agent-gui-node.md)
- [docs/architecture/agent-activity-packages.md](../../../docs/architecture/agent-activity-packages.md)

For composer file references or mention behavior, also read the relevant
reference architecture:

- [docs/architecture/agent-reference-source-services.md](../../../docs/architecture/agent-reference-source-services.md)
- [docs/architecture/agent-reference-mention-resolution.md](../../../docs/architecture/agent-reference-mention-resolution.md)

## AgentGUI Rules

- Treat `AgentActivityRuntime` as the production source for agent activity data
  and commands.
- Keep `AgentHostApi` usage limited to host capabilities such as files,
  clipboard, account/project lookup, diagnostics, and local helper flows.
- Trace the full chain before fixing a local AgentGuiNode symptom: activation,
  selected session, session list, timeline, composer, submit, approval,
  interactive prompt, provider capability, generated files, mention resolution,
  or layout.
- Prefer pure model/projection helpers and focused controller helpers over
  adding orchestration to React components.
- When a fix captures a recurring AgentGuiNode debugging trap, ask the user
  whether to record the lesson in
  [docs/architecture/agent-gui-node.md](../../../docs/architecture/agent-gui-node.md)
  or [docs/conventions/troubleshooting.md](../../../docs/conventions/troubleshooting.md).

## Checks

After changing AgentGUI data flow, run:

```sh
pnpm check:agent-activity-runtime-boundaries
```

For focused package changes, prefer:

```sh
pnpm --filter @tutti-os/agent-gui test
```

Use `pnpm check:changed` before handing off mixed AgentGUI, desktop workbench,
or host adapter changes.
