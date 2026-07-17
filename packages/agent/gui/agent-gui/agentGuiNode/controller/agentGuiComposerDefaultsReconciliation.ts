import type { AgentSessionComposerSettings } from "../../../shared/agentSessionTypes";
import { normalizeOptionalText } from "./agentGuiController.promptHelpers";
import {
  rememberComposerDefaultsFields,
  type AgentGUIComposerDefaults,
  type AgentGUIComposerDefaultsField,
  type AgentGUIRememberComposerDefaultsResult
} from "./agentGuiController.providerHelpers";

interface ComposerDefaultsGeneration {
  generation: number;
  value: string;
}

export interface AgentGUIComposerDefaultsMutation {
  draftKey: string;
  fields: Partial<
    Record<AgentGUIComposerDefaultsField, ComposerDefaultsGeneration>
  >;
}

export interface AgentGUIComposerDefaultsLedger {
  acknowledgedByDraftKey: Record<
    string,
    Partial<Record<AgentGUIComposerDefaultsField, ComposerDefaultsGeneration>>
  >;
  latestByDraftKey: Record<
    string,
    Partial<Record<AgentGUIComposerDefaultsField, number>>
  >;
  nextGeneration: number;
}

export interface AgentGUIRetiredComposerDefault {
  field: AgentGUIComposerDefaultsField;
  value: string;
}

export function createAgentGUIComposerDefaultsLedger(): AgentGUIComposerDefaultsLedger {
  return {
    acknowledgedByDraftKey: {},
    latestByDraftKey: {},
    nextGeneration: 0
  };
}

export function registerAgentGUIComposerDefaultsMutation(
  ledger: AgentGUIComposerDefaultsLedger,
  draftKey: string,
  defaults: AgentGUIComposerDefaults
): AgentGUIComposerDefaultsMutation {
  const latest = (ledger.latestByDraftKey[draftKey] ??= {});
  const acknowledged = (ledger.acknowledgedByDraftKey[draftKey] ??= {});
  const fields: AgentGUIComposerDefaultsMutation["fields"] = {};
  for (const field of rememberComposerDefaultsFields) {
    const value = normalizeOptionalText(defaults[field]);
    if (value === null) continue;
    const generation = ++ledger.nextGeneration;
    latest[field] = generation;
    delete acknowledged[field];
    fields[field] = { generation, value };
  }
  return { draftKey, fields };
}

export function acknowledgeAgentGUIComposerDefaultsMutation(
  ledger: AgentGUIComposerDefaultsLedger,
  mutation: AgentGUIComposerDefaultsMutation,
  result: AgentGUIRememberComposerDefaultsResult
): boolean {
  const latest = ledger.latestByDraftKey[mutation.draftKey];
  if (!latest) return false;
  const acknowledgedFields = new Set(result.acknowledgedFields);
  const acknowledged = (ledger.acknowledgedByDraftKey[mutation.draftKey] ??=
    {});
  let changed = false;
  for (const field of rememberComposerDefaultsFields) {
    const requested = mutation.fields[field];
    if (
      !requested ||
      !acknowledgedFields.has(field) ||
      latest[field] !== requested.generation
    ) {
      continue;
    }
    acknowledged[field] = requested;
    changed = true;
  }
  return changed;
}

export function settingsWithoutAcknowledgedComposerDefaults(
  ledger: AgentGUIComposerDefaultsLedger,
  draftKey: string,
  settings: AgentSessionComposerSettings
): AgentSessionComposerSettings {
  const result = { ...settings };
  const latest = ledger.latestByDraftKey[draftKey];
  const acknowledged = ledger.acknowledgedByDraftKey[draftKey];
  if (!latest || !acknowledged) return result;
  for (const field of rememberComposerDefaultsFields) {
    const entry = acknowledged[field];
    if (
      entry &&
      latest[field] === entry.generation &&
      normalizeOptionalText(result[field]) === entry.value
    ) {
      delete result[field];
    }
  }
  return result;
}

export function retireAcknowledgedComposerDefaults(
  ledger: AgentGUIComposerDefaultsLedger,
  draftKey: string,
  settings: AgentSessionComposerSettings
): AgentGUIRetiredComposerDefault[] {
  const latest = ledger.latestByDraftKey[draftKey];
  const acknowledged = ledger.acknowledgedByDraftKey[draftKey];
  if (!latest || !acknowledged) return [];
  const retired: AgentGUIRetiredComposerDefault[] = [];
  for (const field of rememberComposerDefaultsFields) {
    const entry = acknowledged[field];
    if (!entry) continue;
    if (
      latest[field] === entry.generation &&
      normalizeOptionalText(settings[field]) === entry.value
    ) {
      retired.push({ field, value: entry.value });
    }
    delete acknowledged[field];
  }
  if (Object.keys(acknowledged).length === 0) {
    delete ledger.acknowledgedByDraftKey[draftKey];
  }
  return retired;
}

export function removeRetiredComposerDefaults(
  settings: AgentSessionComposerSettings,
  retired: readonly AgentGUIRetiredComposerDefault[]
): AgentSessionComposerSettings {
  const result = { ...settings };
  for (const entry of retired) {
    if (normalizeOptionalText(result[entry.field]) === entry.value) {
      delete result[entry.field];
    }
  }
  return result;
}
