import type { AgentSessionCommand } from "../../../shared/agentSessionTypes";
import {
  draftForSlashCommand,
  mergeSlashCommands,
  parseSlashCommandInvocation,
  promptForSlashCommand
} from "./agentSlashCommands";

export type AgentSlashCommandProvider = "codex" | "claude-code" | string;

export interface AgentSlashCommandCapability {
  aliases?: readonly string[];
  capability: "browserUse";
  kind: "capability";
  name: string;
}

export type AgentSlashCommand =
  | AgentSessionCommand
  | AgentSlashCommandCapability;

export type SlashCommandSelectionEffect =
  | {
      kind: "fillDraft";
      draft: string;
    }
  | {
      kind: "submitPrompt";
      prompt: string;
    }
  | {
      kind: "showStatus";
    }
  | {
      kind: "togglePlanMode";
    }
  | {
      kind: "enableBrowserUse";
    }
  | {
      kind: "blockCommand";
    };

interface ResolveSlashCommandSelectionEffectInput {
  provider: AgentSlashCommandProvider;
  command: AgentSlashCommand;
  currentDraft: string;
}

interface ResolveSlashCommandSubmitEffectInput {
  provider: AgentSlashCommandProvider;
  commands: readonly AgentSlashCommand[];
  draft: string;
}

const CODEX_IMMEDIATE_SLASH_COMMANDS = new Set(["init", "compact"]);
const PROVIDER_NATIVE_IMMEDIATE_COMMANDS = new Set(["compact"]);
const LOCAL_STATUS_COMMANDS = new Set(["status"]);
const CLAUDE_CODE_PROVIDER_NATIVE_COMMANDS = new Set([
  "compact",
  "context",
  "usage"
]);
const CODEX_FALLBACK_COMMANDS: readonly AgentSessionCommand[] = [
  { name: "compact" },
  { name: "status" }
];
const CLAUDE_CODE_FALLBACK_COMMANDS: readonly AgentSessionCommand[] = [
  { name: "compact" },
  { name: "status" }
];
const BROWSER_USE_CAPABILITY_COMMAND: AgentSlashCommandCapability = {
  kind: "capability",
  capability: "browserUse",
  name: "browser",
  aliases: ["浏览器"]
};

export function resolveSlashCommandsForProvider({
  provider,
  commands,
  hasCompactableContext = true,
  compactSupported,
  browserSupported = false
}: {
  provider: AgentSlashCommandProvider;
  commands: readonly AgentSessionCommand[];
  hasCompactableContext?: boolean;
  /**
   * Negotiated `compact` capability. `false` drops the command entirely
   * (including provider fallbacks); `undefined`/`null` means unknown and
   * keeps the legacy `hasCompactableContext` behavior.
   */
  compactSupported?: boolean | null;
  browserSupported?: boolean;
}): AgentSlashCommand[] {
  const commandEntries = mergeSlashCommands(
    filterUnavailableSlashCommands(commands, {
      compactSupported,
      hasCompactableContext,
      provider
    }),
    filterUnavailableSlashCommands(fallbackCommandsForProvider(provider), {
      compactSupported,
      hasCompactableContext,
      provider
    })
  );
  if (!browserSupported) {
    return commandEntries;
  }
  return [...commandEntries, BROWSER_USE_CAPABILITY_COMMAND];
}

export function resolveSlashCommandSelectionEffect({
  provider,
  command,
  currentDraft
}: ResolveSlashCommandSelectionEffectInput): SlashCommandSelectionEffect {
  if (isBrowserUseCapability(command)) {
    return { kind: "enableBrowserUse" };
  }
  const commandName = normalizedCommandName(command);
  if (isBlockedSlashCommand(provider, commandName)) {
    return { kind: "blockCommand" };
  }
  if (isLocalStatusCommand(provider, commandName)) {
    return { kind: "showStatus" };
  }
  if (isProviderNativeImmediateCommand(provider, commandName)) {
    return {
      kind: "submitPrompt",
      prompt: promptForSlashCommand(command)
    };
  }
  if (isCodexImmediateSlashCommand(provider, command)) {
    return {
      kind: "submitPrompt",
      prompt: promptForSlashCommand(command)
    };
  }
  return {
    kind: "fillDraft",
    draft: draftForSlashCommand(command, currentDraft)
  };
}

export function resolveSlashCommandSubmitEffect({
  provider,
  commands,
  draft
}: ResolveSlashCommandSubmitEffectInput): SlashCommandSelectionEffect | null {
  const invocation = parseSlashCommandInvocation(draft);
  if (!invocation) {
    return null;
  }
  if (isBlockedSlashCommand(provider, invocation.commandName)) {
    return { kind: "blockCommand" };
  }
  const command = commands.find((candidate) =>
    slashCommandMatchesInvocation(candidate, invocation.commandName)
  );
  if (!command) {
    return null;
  }
  if (isBrowserUseCapability(command)) {
    return { kind: "enableBrowserUse" };
  }
  const commandName = normalizedCommandName(command);
  if (isLocalStatusCommand(provider, commandName)) {
    return { kind: "showStatus" };
  }
  if (
    isProviderNativeImmediateCommand(provider, commandName) ||
    isCodexImmediateSlashCommand(provider, command)
  ) {
    return {
      kind: "submitPrompt",
      prompt: invocation.normalizedPrompt
    };
  }
  return null;
}

function isBlockedSlashCommand(
  provider: AgentSlashCommandProvider,
  commandName: string
): boolean {
  return (
    (provider === "codex" || provider === "claude-code") &&
    commandName.trim().toLowerCase() === "plan"
  );
}

function isCodexImmediateSlashCommand(
  provider: AgentSlashCommandProvider,
  command: AgentSessionCommand
): boolean {
  if (provider !== "codex") {
    return false;
  }
  return CODEX_IMMEDIATE_SLASH_COMMANDS.has(command.name.trim().toLowerCase());
}

function fallbackCommandsForProvider(
  provider: AgentSlashCommandProvider
): readonly AgentSessionCommand[] {
  if (provider === "codex") {
    return CODEX_FALLBACK_COMMANDS;
  }
  if (provider === "claude-code") {
    return CLAUDE_CODE_FALLBACK_COMMANDS;
  }
  return [];
}

function isLocalStatusCommand(
  provider: AgentSlashCommandProvider,
  commandName: string
): boolean {
  return (
    (provider === "codex" || provider === "claude-code") &&
    LOCAL_STATUS_COMMANDS.has(commandName)
  );
}

function isProviderNativeImmediateCommand(
  provider: AgentSlashCommandProvider,
  commandName: string
): boolean {
  if (PROVIDER_NATIVE_IMMEDIATE_COMMANDS.has(commandName)) {
    return true;
  }
  return (
    provider === "claude-code" &&
    CLAUDE_CODE_PROVIDER_NATIVE_COMMANDS.has(commandName)
  );
}

function normalizedCommandName(command: { name: string }): string {
  return command.name.trim().toLowerCase();
}

function isBrowserUseCapability(
  command: AgentSlashCommand
): command is AgentSlashCommandCapability {
  return (
    "kind" in command &&
    command.kind === "capability" &&
    command.capability === "browserUse"
  );
}

function slashCommandMatchesInvocation(
  command: AgentSlashCommand,
  commandName: string
): boolean {
  const normalizedInvocation = commandName.trim().toLowerCase();
  if (normalizedCommandName(command) === normalizedInvocation) {
    return true;
  }
  const aliases = "aliases" in command ? (command.aliases ?? []) : [];
  return aliases.some(
    (alias) => alias.trim().toLowerCase() === normalizedInvocation
  );
}

function filterUnavailableSlashCommands(
  commands: readonly AgentSessionCommand[],
  input: {
    compactSupported?: boolean | null;
    hasCompactableContext: boolean;
    provider: AgentSlashCommandProvider;
  }
): AgentSessionCommand[] {
  return commands.filter((command) => {
    const commandName = normalizedCommandName(command);
    if (
      (input.provider === "codex" || input.provider === "claude-code") &&
      commandName === "plan"
    ) {
      return false;
    }
    if (commandName === "compact") {
      if (input.compactSupported === false) {
        return false;
      }
      return input.hasCompactableContext;
    }
    return true;
  });
}
