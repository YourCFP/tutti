import type { AgentActivityComposerOptions } from "./types.ts";
import { resolveAgentActivityPromptImagesSupported } from "./selectors.ts";

/** Mirror of packages/agent/daemon/runtime/capabilities.go. */
export const AGENT_CAPABILITY_KEYS = [
  "imageInput",
  "skills",
  "compact",
  "tokenUsage",
  "rateLimits",
  "planMode",
  "interrupt"
] as const;

export type AgentCapabilityKey = (typeof AGENT_CAPABILITY_KEYS)[number];

export interface AgentActivityCapabilityInput {
  composerOptions?: AgentActivityComposerOptions | null;
  sessionRuntimeContext?: Record<string, unknown> | null;
}

export function resolveAgentActivityCapability(
  key: AgentCapabilityKey,
  input: AgentActivityCapabilityInput
): boolean | null {
  const resolved =
    capabilityFromRuntimeContext(key, input.sessionRuntimeContext) ??
    capabilityFromRuntimeContext(key, input.composerOptions?.runtimeContext);
  if (resolved !== null) {
    return resolved;
  }
  if (key === "imageInput") {
    return resolveAgentActivityPromptImagesSupported(input);
  }
  return null;
}

function capabilityFromRuntimeContext(
  key: string,
  runtimeContext: Record<string, unknown> | null | undefined
): boolean | null {
  const list = runtimeContext?.capabilities;
  if (!Array.isArray(list)) {
    return null;
  }
  return list.some((entry) => typeof entry === "string" && entry === key);
}
