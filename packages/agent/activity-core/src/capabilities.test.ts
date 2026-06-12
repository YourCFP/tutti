import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGENT_CAPABILITY_KEYS,
  resolveAgentActivityCapability
} from "./capabilities.ts";
import type { AgentActivityComposerOptions } from "./types.ts";

test("runtime capabilities take precedence over composer options", () => {
  assert.equal(
    resolveAgentActivityCapability("compact", {
      sessionRuntimeContext: { capabilities: ["interrupt"] },
      composerOptions: composerOptions({ capabilities: ["compact"] })
    }),
    false
  );
  assert.equal(
    resolveAgentActivityCapability("compact", {
      sessionRuntimeContext: { capabilities: ["compact"] }
    }),
    true
  );
});

test("falls back to composer options when session has no capability list", () => {
  assert.equal(
    resolveAgentActivityCapability("skills", {
      sessionRuntimeContext: {},
      composerOptions: composerOptions({ capabilities: ["skills"] })
    }),
    true
  );
});

test("returns null when no capability data exists", () => {
  assert.equal(resolveAgentActivityCapability("compact", {}), null);
});

test("imageInput falls back to legacy promptCapabilities", () => {
  assert.equal(
    resolveAgentActivityCapability("imageInput", {
      sessionRuntimeContext: { promptCapabilities: { image: true } }
    }),
    true
  );
  assert.equal(
    resolveAgentActivityCapability("imageInput", {
      composerOptions: composerOptions({ promptCapabilities: { image: false } })
    }),
    false
  );
});

test("vocabulary matches the Go side", () => {
  assert.deepEqual([...AGENT_CAPABILITY_KEYS].sort(), [
    "compact",
    "imageInput",
    "interrupt",
    "planMode",
    "rateLimits",
    "skills",
    "tokenUsage"
  ]);
});

function composerOptions(
  runtimeContext: Record<string, unknown>
): AgentActivityComposerOptions {
  return {
    provider: "codex",
    models: [],
    reasoningEfforts: [],
    permissionConfig: null,
    runtimeContext,
    skills: [],
    loadedAtUnixMs: 1
  };
}
