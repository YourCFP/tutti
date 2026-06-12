# Agent GUI 能力對齊收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鉗制點收斂到 daemon（刪 GUI `composerSupportForProvider` 表）、計畫模式 GUI 入口（claude-code）、Skills 面板分組、刪 legacy promptCapabilities 雙信號、詞表漂移測試、隱藏 skills 名單收斂。

**Architecture:** 「provider 支持哪些 composer 設置」的真相源收斂為後端唯一（Go `SupportsComposerSettings` + 能力詞表 + composer options 的 `configurable` 欄位），GUI 變純消費者。計畫模式 toggle 的 UI/VM/i18n **已全部存在**（`supportsPlanMode`/`effectivePlanMode`/`planUnavailable` 管線、AgentComposer 開關、planMode* i18n keys），唯一的鎖是表裡的 `plan: false`——翻轉門控源 + exit-plan 批准自動退出即完成。

**Tech Stack:** Go（services/nextopd、packages/agent/daemon）、TypeScript（packages/agent/activity-core node:test、packages/agent/gui vitest）。

**工作目錄:** `/Users/riceballpapa/Repo/nextop/.claude/worktrees/capability-followups`（分支 `capability-followups`，stacked on `capability-negotiation`）。

**Spec:** `docs/superpowers/specs/2026-06-12-agent-gui-capability-followups-design.md`

---

### Task 1: Go — daemon 成為唯一鉗制點

**Files:**
- Modify: `services/nextopd/service/agent/composer_options.go`（`normalizeComposerSettingsForProvider`，:307 附近）
- Test: `services/nextopd/service/agent/composer_options_test.go`

- [ ] **Step 1: 寫失敗測試**（追加到 composer_options_test.go）

```go
func TestNormalizeComposerSettingsClampsByProviderSupport(t *testing.T) {
	t.Parallel()
	// model/reasoning：不支持 composer 設置的 provider 必須清空
	for _, provider := range []string{"hermes", "nexight", "openclaw"} {
		got := normalizeComposerSettingsForProvider(provider, ComposerSettings{
			Model:           "some-model",
			ReasoningEffort: "high",
			PlanMode:        true,
		})
		if got.Model != "" {
			t.Fatalf("%s model = %q, want empty", provider, got.Model)
		}
		if got.ReasoningEffort != "" {
			t.Fatalf("%s reasoningEffort = %q, want empty", provider, got.ReasoningEffort)
		}
	}
	// planMode：只有靜態能力含 planMode 的 provider（claude-code）保留
	claude := normalizeComposerSettingsForProvider("claude-code", ComposerSettings{PlanMode: true})
	if !claude.PlanMode {
		t.Fatalf("claude-code planMode clamped, want preserved")
	}
	for _, provider := range []string{"codex", "gemini", "hermes", "nexight", "openclaw"} {
		got := normalizeComposerSettingsForProvider(provider, ComposerSettings{PlanMode: true})
		if got.PlanMode {
			t.Fatalf("%s planMode = true, want clamped to false", provider)
		}
	}
	// 支持設置的 provider：model/reasoning 不被誤清
	codex := normalizeComposerSettingsForProvider("codex", ComposerSettings{
		Model:           "gpt-5.3-codex",
		ReasoningEffort: "high",
	})
	if codex.Model != "gpt-5.3-codex" || codex.ReasoningEffort != "high" {
		t.Fatalf("codex settings clamped unexpectedly: %+v", codex)
	}
}

func TestComposerConfigConfigurableTruthTable(t *testing.T) {
	t.Parallel()
	// 釘死「後端 configurable 旗標」與舊 GUI 硬編碼表等價（GUI 刪表的前提）。
	cases := []struct {
		provider   string
		model      bool // == 舊表 supports.model / supports.reasoning
		permission bool // == 舊表 supports.permission
	}{
		{"claude-code", true, true},
		{"codex", true, true},
		{"gemini", true, false},
		{"hermes", false, false},
		{"nexight", false, true},
		{"openclaw", false, false},
	}
	for _, tc := range cases {
		model := composerModelConfig(tc.provider, "", nil)
		reasoning := composerReasoningConfig(tc.provider, "", "en")
		permission := composerPermissionConfig(tc.provider, "", "en")
		if model.Configurable != tc.model {
			t.Fatalf("%s modelConfig.configurable = %v, want %v", tc.provider, model.Configurable, tc.model)
		}
		if reasoning.Configurable != tc.model {
			t.Fatalf("%s reasoningConfig.configurable = %v, want %v", tc.provider, reasoning.Configurable, tc.model)
		}
		if permission.Configurable != tc.permission {
			t.Fatalf("%s permissionConfig.configurable = %v, want %v", tc.provider, permission.Configurable, tc.permission)
		}
	}
}
```

注意：若 `composerPermissionConfig` 的 gemini/hermes 旗標與表不一致（測試會暴露），按舊 GUI 表的值修 Go 側（舊表是現網行為）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd services/nextopd && go test ./service/agent/ -run 'TestNormalizeComposerSettingsClampsByProviderSupport|TestComposerConfigConfigurableTruthTable' -count=1`
Expected: 第一個 FAIL（hermes model 未清空）；第二個視現狀可能 PASS

- [ ] **Step 3: 實現補鉗**

`normalizeComposerSettingsForProvider` 改為：

```go
func normalizeComposerSettingsForProvider(provider string, settings ComposerSettings) ComposerSettings {
	provider = agentprovider.Normalize(provider)
	settings.Model = strings.TrimSpace(settings.Model)
	settings.PermissionModeID = normalizePermissionModeIDForProvider(provider, settings.PermissionModeID)
	settings.ReasoningEffort = normalizeReasoningEffortForProvider(provider, settings.ReasoningEffort)
	if !agentprovider.SupportsComposerSettings(provider) {
		settings.Model = ""
		settings.ReasoningEffort = ""
	}
	if !composerProviderSupportsPlanMode(provider) {
		settings.PlanMode = false
	}
	return settings
}

// composerProviderSupportsPlanMode mirrors the static capability defaults so
// the daemon clamps plan mode for providers that never negotiate it.
func composerProviderSupportsPlanMode(provider string) bool {
	for _, capability := range composerProviderCapabilities(provider) {
		if capability == "planMode" {
			return true
		}
	}
	return false
}
```

- [ ] **Step 4: 跑測試確認通過 + 全包回歸**

Run: `go test ./service/agent/ -count=1`
Expected: PASS（若既有測試依賴「hermes 透傳 model」之類行為而失敗，逐一核對：那正是本次有意收斂的行為，更新測試期望）

- [ ] **Step 5: Commit**

```bash
git add services/nextopd/service/agent/
git commit -m "feat(nextopd): composer settings clamped solely by daemon per provider support"
```

### Task 2: TS — 數據驅動 support 推導函數 + 等價性測試

**Files:**
- Create: `packages/agent/gui/agent-gui/agentGuiNode/model/composerSettingsSupport.ts`
- Test: `packages/agent/gui/agent-gui/agentGuiNode/model/composerSettingsSupport.spec.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, expect, it } from "vitest";
import { composerSettingsSupportFromOptions } from "./composerSettingsSupport";
import type { AgentActivityComposerOptions } from "@tutti-os/agent-activity-core";

function optionsFixture(input: {
  model: boolean;
  permission: boolean;
  capabilities?: string[];
}): AgentActivityComposerOptions {
  return {
    modelConfig: { configurable: input.model, currentValue: null, defaultValue: null, options: [] },
    reasoningConfig: { configurable: input.model, currentValue: null, defaultValue: null, options: [] },
    permissionConfig: { configurable: input.permission, defaultValue: null, modes: [] },
    skills: [],
    runtimeContext: input.capabilities ? { capabilities: input.capabilities } : {}
  } as unknown as AgentActivityComposerOptions;
}

describe("composerSettingsSupportFromOptions", () => {
  // 等價性真值表：與被刪除的 composerSupportForProvider 硬編碼表逐欄一致
  // （plan 欄除外——舊表寫死 false，新推導走能力協商，這是本次有意變更）。
  // 後端旗標的真值由 Go 側 TestComposerConfigConfigurableTruthTable 釘死。
  const providerFlags: Record<
    string,
    { model: boolean; permission: boolean; capabilities: string[] }
  > = {
    "claude-code": {
      model: true,
      permission: true,
      capabilities: ["imageInput", "skills", "compact", "tokenUsage", "rateLimits", "planMode", "interrupt"]
    },
    codex: {
      model: true,
      permission: true,
      capabilities: ["imageInput", "skills", "compact", "tokenUsage", "rateLimits", "interrupt"]
    },
    gemini: { model: true, permission: false, capabilities: ["interrupt"] },
    hermes: { model: false, permission: false, capabilities: ["interrupt"] },
    nexight: { model: false, permission: true, capabilities: ["interrupt"] },
    openclaw: { model: false, permission: false, capabilities: [] }
  };
  const legacyTable: Record<
    string,
    { model: boolean; reasoning: boolean; permission: boolean }
  > = {
    "claude-code": { model: true, reasoning: true, permission: true },
    codex: { model: true, reasoning: true, permission: true },
    gemini: { model: true, reasoning: true, permission: false },
    hermes: { model: false, reasoning: false, permission: false },
    nexight: { model: false, reasoning: false, permission: true },
    openclaw: { model: false, reasoning: false, permission: false }
  };

  for (const [provider, flags] of Object.entries(providerFlags)) {
    it(`matches the legacy table for ${provider}`, () => {
      const support = composerSettingsSupportFromOptions(
        optionsFixture(flags),
        null
      );
      expect(support.model).toBe(legacyTable[provider]!.model);
      expect(support.reasoning).toBe(legacyTable[provider]!.reasoning);
      expect(support.permission).toBe(legacyTable[provider]!.permission);
      expect(support.plan).toBe(provider === "claude-code");
    });
  }

  it("returns all-false when composer options are absent", () => {
    expect(composerSettingsSupportFromOptions(null, null)).toEqual({
      model: false,
      reasoning: false,
      permission: false,
      plan: false
    });
  });

  it("prefers session runtime capabilities for plan", () => {
    const support = composerSettingsSupportFromOptions(
      optionsFixture({ model: true, permission: true, capabilities: [] }),
      { capabilities: ["planMode"] }
    );
    expect(support.plan).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd packages/agent/gui && pnpm vitest run agentGuiNode/model/composerSettingsSupport.spec.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實現**

```ts
import {
  resolveAgentActivityCapability,
  type AgentActivityComposerOptions
} from "@tutti-os/agent-activity-core";

export interface AgentComposerSettingsSupport {
  model: boolean;
  reasoning: boolean;
  permission: boolean;
  plan: boolean;
}

export function composerSettingsSupportFromOptions(
  composerOptions: AgentActivityComposerOptions | null,
  sessionRuntimeContext: Record<string, unknown> | null
): AgentComposerSettingsSupport {
  return {
    model: composerOptions?.modelConfig?.configurable ?? false,
    reasoning: composerOptions?.reasoningConfig?.configurable ?? false,
    permission: composerOptions?.permissionConfig?.configurable ?? false,
    plan:
      resolveAgentActivityCapability("planMode", {
        composerOptions,
        sessionRuntimeContext
      }) === true
  };
}
```

注意：activity-core 的 import 名以 `packages/agent/gui` 現有 import 慣例為準（grep `from "@tutti-os/agent-activity-core"` 或相對路徑，照抄）；`AgentActivityComposerOptions` 各 config 欄位名以 `packages/agent/activity-core/src/types.ts` 為準，若 `permissionConfig` 欄位名不同（如 `permission`），同步修 fixture 與實現。

- [ ] **Step 4: 跑測試確認通過** → 同 Step 2 命令，Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/agent-gui/agentGuiNode/model/composerSettingsSupport.ts packages/agent/gui/agent-gui/agentGuiNode/model/composerSettingsSupport.spec.ts
git commit -m "feat(agent-gui): data-driven composer settings support resolver with legacy-table equivalence test"
```

### Task 3: GUI — 刪除 composerSupportForProvider，全部調用點切換

**Files:**
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUINodeController.ts`
  - 刪除 `composerSupportForProvider`（:1301-1325）
  - 調用點：:1271（buildNodeDefaultComposerSettings）、:1345（nodeDataFromComposerSettings）、:2313（defaultReasoningEffort）、:3363/:3395/:3415（composer options 載入門）、:5121（updateComposerSettings）、:6478-6556（composerSettings VM）
- Test: 既有 `useAgentGUINodeController.spec.tsx` / `AgentGUINode.spec.tsx` 回歸

- [ ] **Step 1: 純函數去鉗制**——`buildNodeDefaultComposerSettings`（:1265）與 `nodeDataFromComposerSettings`（:1341）刪除 `supports` 參與，只保留通用清洗：

```ts
function buildNodeDefaultComposerSettings(
  data: AgentGUINodeData,
  options?: { defaultReasoningEffort?: AgentSessionReasoningEffort | null }
): AgentSessionComposerSettings {
  const composerOverrides = nodeComposerOverridesForProvider(data) ?? {};
  return {
    model: normalizeOptionalText(composerOverrides.model),
    reasoningEffort:
      ((normalizeOptionalText(
        composerOverrides.reasoningEffort
      ) as AgentSessionReasoningEffort | null) ??
        options?.defaultReasoningEffort ??
        null),
    planMode: Boolean(composerOverrides.planMode),
    permissionModeId: normalizePermissionModeId(
      composerOverrides.permissionModeId
    )
  };
}
```

`nodeDataFromComposerSettings` 的 composerOverrides 同樣去掉 `supports.model ? ... : null` / `supports.plan ? ... : false` 三元，直接保留清洗後的值。provider 級鉗制由 daemon 兜底（Task 1）。

- [ ] **Step 2: 控制器頂部**——:2313 替換為常量：

```ts
const defaultReasoningEffort: AgentSessionReasoningEffort | null = "high";
```

（不支持 reasoning 的 provider：值會被 daemon 清空且菜單不渲染，無 UI 可見性。）

- [ ] **Step 3: 載入門全部拆除**——:3363、:3395、:3415 三處 `if (!supports.model && !supports.reasoning && !supports.permission) return` 早退刪除（composer options 對所有 provider 無條件載入：capabilities/skills 兜底本就需要它），對應 useCallback/useEffect 依賴陣列移除 `supports.*` 項。

- [ ] **Step 4: updateComposerSettings（:5119）去鉗制**——刪除 `currentSupports` 與 `delete supportedNextSettings.planMode` 邏輯；`merged` 中 planMode 改為 `supportedNextSettings.planMode ?? previousSettings.planMode`。同函數內其他 `currentSupports.plan` 三元同步移除（保留值透傳）。

- [ ] **Step 5: composerSettings VM 切換數據驅動**——在 VM useMemo（:6469）上方新增：

```ts
const composerSupport = useMemo(
  () =>
    composerSettingsSupportFromOptions(
      providerComposerOptions,
      activeSessionRuntimeContext ?? null
    ),
  [providerComposerOptions, activeSessionRuntimeContext]
);
```

（`activeSessionRuntimeContext` 為控制器內既有的活躍會話 runtimeContext 變數，以 :1990 附近 `resolveAgentActivityPromptImagesSupported` 調用使用的同名變數為準。）VM 內所有 `supports.model/reasoning/permission/plan` 改為 `composerSupport.*`；`hasACPSettings` 改寫為：

```ts
const hasAnySettings =
  composerSupport.model || composerSupport.reasoning || composerSupport.permission;
const hasACPSettings =
  hasOptionsSource &&
  (!composerSupport.model || activeSessionModelSelection !== null) &&
  (!composerSupport.reasoning || activeSessionReasoningSelection !== null);
const isSettingsLoading = !hasACPSettings;
```

（行為差異說明：無設置 provider 在 options 到達前短暫 loading 後隱藏，原為立即隱藏；有設置 provider 行為不變。）依賴陣列同步：刪 `supports.*`，加 `composerSupport`。import `composerSettingsSupportFromOptions`。

- [ ] **Step 6: 刪除 `composerSupportForProvider` 函數本體**，確認無殘餘引用：

Run: `grep -n 'composerSupportForProvider\|supports\.' packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUINodeController.ts`
Expected: 無輸出（或僅 `composerSupport.` 新名）

- [ ] **Step 7: typecheck + 全包測試**

Run: `cd packages/agent/gui && pnpm typecheck && pnpm vitest run`
Expected: typecheck 乾淨；既有 spec 中斷言「codex/claude 設置菜單」的測試若因 fixture 未含 composer options 而失敗，為 fixture 補 `modelConfig/reasoningConfig/permissionConfig`（configurable 按 Go 真值表），不改斷言語義。plan 相關：原斷言 `supportsPlanMode === false` 的測試改為按 fixture capabilities 推導。

- [ ] **Step 8: Commit**

```bash
git add packages/agent/gui/
git commit -m "refactor(agent-gui): composer settings support is data-driven; drop hardcoded provider table"
```

### Task 4: A — exit-plan 批准後自動退出計畫模式

**Files:**
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUINodeController.ts`（`activePendingPromptRef` :1950、其賦值 effect :6270、`submitInteractivePrompt` :4840）
- Test: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUINodeController.spec.tsx`

- [ ] **Step 1: 寫失敗測試**（模仿該 spec 既有的 controller 測試 setup：渲染 hook、注入 fake runtime、製造 exit-plan pending prompt——參考既有 interactive prompt 測試的 fixture；斷言批准後 composer settings 的 planMode 變 false、拒絕後保持 true）

```ts
it("clears plan mode after approving an exit-plan prompt", async () => {
  // setup：provider claude-code、planMode=true 的 draft 設置、
  // 活躍會話帶 kind="exit-plan" 的 pendingInteractivePrompt（requestId "req-1"）
  // 操作：controller.actions.submitInteractivePrompt({ requestId: "req-1", action: "allow", optionId: "acceptEdits" })
  // 等待 fake runtime submitInteractive resolve
  // 斷言：viewModel.composerSettings.draftSettings.planMode === false
});

it("keeps plan mode after rejecting an exit-plan prompt", async () => {
  // 同 setup；action: "deny" → planMode 保持 true
});
```

（具體 fixture 構造照抄該文件中既有 submitInteractivePrompt / pendingInteractivePrompt 測試；若無現成 exit-plan fixture，找 `kind: "exit-plan"` 的 conversationModel 測試輸入復用。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `pnpm vitest run agentGuiNode/controller/useAgentGUINodeController.spec.tsx -t "exit-plan"`
Expected: FAIL（批准後 planMode 仍為 true）

- [ ] **Step 3: 實現**

1. `activePendingPromptRef` 類型加 `kind`：

```ts
const activePendingPromptRef = useRef<{
  sessionId: string;
  requestId: string;
  kind: string | null;
} | null>(null);
```

2. :6270 賦值 effect 補 kind（`rawPendingInteractivePrompt?.kind ?? null`，依賴陣列同步加入）。
3. `updateComposerSettings` 定義晚於 `submitInteractivePrompt`，用 ref 橋接：在兩者之前聲明 `const updateComposerSettingsRef = useRef<(next: Partial<AgentSessionComposerSettings>) => void>(() => {});`，在 `updateComposerSettings` 定義後緊跟 `updateComposerSettingsRef.current = updateComposerSettings;`（render 期賦值，倉庫已有同模式：`latestItemsByKey`）。
4. `submitInteractivePrompt` 內，進入 promise 前捕獲 `const submittedPrompt = activePendingPromptRef.current;`，成功 `.then` 中：

```ts
if (
  submittedPrompt?.requestId === normalizedRequestId &&
  submittedPrompt.kind === "exit-plan" &&
  input.action === "allow"
) {
  // Plan approved: leave plan mode so the next turn executes instead of replanning.
  updateComposerSettingsRef.current({ planMode: false });
}
```

- [ ] **Step 4: 跑測試確認通過** → 同 Step 2，Expected: PASS；再跑 `pnpm vitest run && pnpm typecheck` 全包回歸

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/
git commit -m "feat(agent-gui): approving exit-plan clears the plan mode setting"
```

### Task 5: B — Skills 斜杠面板分組

**Files:**
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentSlashCommandPalette.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentComposer.tsx`（傳入分組 label props）
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentGUINode.tsx`（labels 接線）+ `packages/agent/gui/app/renderer/i18n/locales/en.ts` / `zh-CN.ts`
- Test: `packages/agent/gui/agent-gui/agentGuiNode/AgentComposer.spec.tsx`（既有 palette 測試處）

- [ ] **Step 1: 寫失敗測試**（在 AgentComposer.spec.tsx 既有 slash palette 測試旁）

```ts
it("groups slash palette entries into command and skill sections", async () => {
  // setup：照抄既有「palette 顯示 skills」測試的 fixture（availableCommands 非空 + availableSkills 非空），輸入 "/" 喚出 palette
  // 斷言：
  // expect(screen.getByText("Commands")).toBeTruthy();   // 分組標題（label 由 props 傳入）
  // expect(screen.getByText("Skills")).toBeTruthy();
  // 僅命令無 skills 時：queryByText("Commands") 為 null（單組不顯示標題）
});
```

- [ ] **Step 2: 確認失敗** → Run: `pnpm vitest run agentGuiNode/AgentComposer.spec.tsx -t "groups slash palette"`，Expected: FAIL

- [ ] **Step 3: 實現**

`AgentSlashCommandPalette.tsx`：props 增加 `commandsGroupLabel: string; skillsGroupLabel: string;`；渲染時在 `entries.map` 中、`index === firstCommandIndex` / `index === firstSkillIndex` 前插入組標題（僅當兩種 type 並存）：

```tsx
const hasCommands = entries.some((entry) => entry.type === "command");
const hasSkills = entries.some((entry) => entry.type === "skill");
const showGroupHeaders = hasCommands && hasSkills;
const firstSkillIndex = entries.findIndex((entry) => entry.type === "skill");
```

map 內 button 前：

```tsx
{showGroupHeaders && index === 0 && entry.type === "command" ? (
  <div key="group-commands" className={paletteStyles.groupHeader} aria-hidden="true">
    {commandsGroupLabel}
  </div>
) : null}
{showGroupHeaders && index === firstSkillIndex ? (
  <div key="group-skills" className={paletteStyles.groupHeader} aria-hidden="true">
    {skillsGroupLabel}
  </div>
) : null}
```

（map 返回 Fragment 包裹 header+button，key 用 entry.key。）`paletteStyles` 增加：

```ts
groupHeader:
  "px-2.5 pb-0.5 pt-1.5 text-[11px] font-normal text-[var(--text-secondary)] select-none"
```

組標題非 option、無 role，鍵盤導航的 entries index 不變。

`AgentComposer.tsx`：palette 調用處透傳兩個新 label props（從 `labels` 取）。`AgentGUINode.tsx` labels 物件加：

```ts
slashPaletteCommandsGroup: t("agentHost.agentGui.slashPaletteCommandsGroup"),
slashPaletteSkillsGroup: t("agentHost.agentGui.slashPaletteSkillsGroup"),
```

i18n（en.ts，`slashCommandPalette` key 旁）：

```ts
slashPaletteCommandsGroup: "Commands",
slashPaletteSkillsGroup: "Skills",
```

zh-CN.ts：

```ts
slashPaletteCommandsGroup: "命令",
slashPaletteSkillsGroup: "技能",
```

（AgentComposer 的 labels 類型定義同步補兩個欄位。）

- [ ] **Step 4: 通過 + 回歸** → `pnpm vitest run agentGuiNode/AgentComposer.spec.tsx && pnpm typecheck && pnpm check:i18n`（check:i18n 在倉庫根目錄跑），Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/gui/
git commit -m "feat(agent-gui): group slash palette into command and skill sections"
```

### Task 6: R2 — 刪 legacy promptCapabilities 雙信號

**Files:**
- Modify: `packages/agent/daemon/runtime/standard_acp_adapter.go`（:1259）、`packages/agent/daemon/runtime/codex_appserver_adapter.go`（:948）、`packages/agent/daemon/runtime/prompt_content.go`（:151 `promptCapabilitiesRuntimeContext`）
- Modify: `services/nextopd/service/agent/composer_options.go`（:106 `"promptCapabilities"` 行 + `composerPromptCapabilities` 函數）
- Modify: `packages/agent/activity-core/src/capabilities.ts`（刪 imageInput fallback）、`packages/agent/activity-core/src/selectors.ts`（刪 `resolveAgentActivityPromptImagesSupported` 及 `promptImagesSupportedFromRuntimeContext`）
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUINodeController.ts`（:1990 改用 `resolveAgentActivityCapability("imageInput", ...)`）
- Test: 對應 Go/TS 測試更新

- [ ] **Step 1: 先改 TS 消費端測試為失敗態**——capabilities.test.ts 中「imageInput falls back to legacy promptCapabilities」測試改為斷言**純 capabilities 列表推導**：

```ts
test("imageInput resolves from capabilities list only", () => {
  assert.equal(
    resolveAgentActivityCapability("imageInput", {
      sessionRuntimeContext: { capabilities: ["imageInput"] }
    }),
    true
  );
  assert.equal(
    resolveAgentActivityCapability("imageInput", {
      sessionRuntimeContext: { promptCapabilities: { image: true } } // legacy 信號不再被讀取
    }),
    null
  );
});
```

Run: `cd packages/agent/activity-core && pnpm test`，Expected: 新斷言 FAIL（legacy 仍生效）

- [ ] **Step 2: TS 實現**——capabilities.ts 刪 `if (key === "imageInput")` 分支與 selectors import；selectors.ts 刪 `resolveAgentActivityPromptImagesSupported`、`promptImagesSupportedFromRuntimeContext`、`AgentActivityPromptImagesSupportInput` 與包導出；controller :1990 改：

```ts
const resolvedPromptImagesSupported = resolveAgentActivityCapability("imageInput", {
  composerOptions: activeComposerOptions,
  sessionRuntimeContext: activeSessionRuntimeContext ?? null
});
const promptImagesSupported = resolvedPromptImagesSupported ?? true;
```

Run: `pnpm test && pnpm typecheck`（activity-core）+ `cd ../gui && pnpm typecheck && pnpm vitest run`，Expected: PASS（gui 中引用被刪導出的測試/代碼同步更新）

- [ ] **Step 3: Go 停發**——刪除三處發射：standard_acp_adapter.go:1259、codex_appserver_adapter.go:948 的 `"promptCapabilities"` 條目、composer_options.go:106 行與 `composerPromptCapabilities` 函數、prompt_content.go 的 `promptCapabilitiesRuntimeContext` 函數。注意保留 `acpPromptImageSupported`（讀 ACP initialize 響應，capabilities 推導仍依賴 promptImage 旗標）。

- [ ] **Step 4: Go 測試更新**——standard_acp_adapter_test.go:480-531 等斷言 `promptCapabilities["image"]` 的測試改為斷言 `capabilities` 列表含/不含 `"imageInput"`；composer options 相關測試同步。

Run: `cd packages/agent/daemon && go test ./runtime/ -count=1 && cd ../../../services/nextopd && go test ./service/agent/ -count=1`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/agent/daemon/ services/nextopd/ packages/agent/activity-core/ packages/agent/gui/
git commit -m "refactor: retire legacy promptCapabilities signal; imageInput rides the capabilities list"
```

### Task 7: R3 — Go/TS 能力詞表漂移測試

**Files:**
- Test: `packages/agent/daemon/runtime/capabilities_vocabulary_test.go`（新建）

- [ ] **Step 1: 寫測試**

```go
package agentruntime

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

// Locks the Go capability vocabulary to the TS mirror so drift fails CI.
func TestCapabilityVocabularyMatchesTypeScript(t *testing.T) {
	t.Parallel()
	tsPath := filepath.Join("..", "..", "activity-core", "src", "capabilities.ts")
	raw, err := os.ReadFile(tsPath)
	if err != nil {
		t.Fatalf("read %s: %v", tsPath, err)
	}
	block := regexp.MustCompile(`AGENT_CAPABILITY_KEYS = \[(?s)(.*?)\]`).FindSubmatch(raw)
	if block == nil {
		t.Fatalf("AGENT_CAPABILITY_KEYS not found in %s", tsPath)
	}
	tsKeys := regexp.MustCompile(`"([a-zA-Z]+)"`).FindAllStringSubmatch(string(block[1]), -1)
	got := make([]string, 0, len(tsKeys))
	for _, match := range tsKeys {
		got = append(got, match[1])
	}
	want := []string{
		CapabilityImageInput, CapabilitySkills, CapabilityCompact,
		CapabilityTokenUsage, CapabilityRateLimits, CapabilityPlanMode, CapabilityInterrupt,
	}
	sort.Strings(got)
	sort.Strings(want)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("vocabulary drift:\n  ts = %v\n  go = %v", got, want)
	}
}
```

（相對路徑以 `packages/agent/daemon/runtime` 為基準；若 daemon go.mod 在 `packages/agent/daemon`，路徑為 `../../activity-core/src/capabilities.ts`——以實際目錄結構為準先 `ls` 驗證。）

- [ ] **Step 2: 跑測試確認通過**

Run: `cd packages/agent/daemon && go test ./runtime/ -run TestCapabilityVocabularyMatchesTypeScript -count=1`
Expected: PASS（再臨時改動 TS 文件驗證會 FAIL，改回）

- [ ] **Step 3: Commit**

```bash
git add packages/agent/daemon/runtime/capabilities_vocabulary_test.go
git commit -m "test(agent): lock capability vocabulary against the TS mirror"
```

### Task 8: R4 — 隱藏 skills 名單收斂

**Files:**
- Modify: `services/nextopd/service/agentsidecar/provider_skill.go`（:11-13 常量處導出統一名單）
- Modify: `services/nextopd/service/agent/skill_options.go`（:21-25 `hiddenNextopProviderSkills` 改引用）

- [ ] **Step 1: 確認 import 方向**

Run: `grep -rn 'agentsidecar' services/nextopd/service/agent/*.go | head -3`
若 service/agent 已 import agentsidecar → 名單放 agentsidecar；若反向依賴（agentsidecar import service/agent）→ 名單放 service/agent 並讓 agentsidecar 引用；兩者皆非 → 名單放 agentsidecar（語義歸屬：注入者擁有名單），service/agent 加 import。

- [ ] **Step 2: 實現**（以放 agentsidecar 為例）

provider_skill.go：

```go
const nextopSkillName = "nextop-cli"
const issueManagerSkillName = "issue-manager"
const workspaceAppSkillName = "workspace-app"

// NextopProviderSkillNames lists the nextop-injected provider skills that the
// composer skill discovery must hide from user-facing lists.
func NextopProviderSkillNames() []string {
	return []string{nextopSkillName, issueManagerSkillName, workspaceAppSkillName}
}
```

skill_options.go：刪除字面量 map，改：

```go
var hiddenNextopProviderSkills = func() map[string]struct{} {
	hidden := make(map[string]struct{})
	for _, name := range agentsidecar.NextopProviderSkillNames() {
		hidden[name] = struct{}{}
	}
	return hidden
}()
```

- [ ] **Step 3: 驗證**

Run: `cd services/nextopd && go build ./... && go test ./service/agent/ ./service/agentsidecar/ -count=1`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add services/nextopd/
git commit -m "refactor(nextopd): single source for hidden nextop provider skill names"
```

### Task 9: 全量驗證

- [ ] **Step 1: TS 全量** → 倉庫根目錄：`pnpm --filter @tutti-os/agent-gui test && pnpm --filter @tutti-os/agent-gui typecheck && cd packages/agent/activity-core && pnpm test && pnpm typecheck`，Expected: 全 PASS
- [ ] **Step 2: Go 全量** → `cd packages/agent/daemon && go test ./... -count=1 && cd ../../../services/nextopd && go test ./... -count=1`，Expected: PASS（nextopd 已知的 agentstatus 並行 flake 單獨重跑確認）
- [ ] **Step 3: i18n + lint** → 根目錄 `pnpm check:i18n && pnpm lint:ts 2>&1 | tail -5`，Expected: 無 error（注意：本地若有其他 worktree 的髒文件干擾 lint，以本 worktree 文件的告警為準）
- [ ] **Step 4: desktop 回歸** → `pnpm --filter @tutti-os/desktop test && pnpm --filter @tutti-os/desktop typecheck`，Expected: PASS
- [ ] **Step 5: 真機驗收清單**（人工，記錄到 PR 描述）：
  - claude-code：設置面板出現計畫模式開關 → 開啟 → 發消息進入只讀規劃 → exit-plan 卡批准 → 開關自動關閉 → 下一輪正常執行；拒絕分支保持規劃
  - codex：設置面板無計畫模式開關；composer 設置行與改前一致
  - 兩 provider：`/` 面板命令與 Skills 分組顯示、選擇行為正常；圖片貼上在 claude/codex 正常、不支持 provider 拒絕提示正常
