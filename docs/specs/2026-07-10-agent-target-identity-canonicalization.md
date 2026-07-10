# Agent Target 身份规范化与 Composer 缓存键修复

- 日期：2026-07-10
- 状态：待执行（派发给 ops 分工作流落地）
- 背景 bug：shared 会话携带 owner 域 agentTargetId（形如 `02fc7056...`）泄漏进本地链路，被 agent-gui 当作 composer options 缓存键，与 rail 选中 target 的 id 错位，导致缓存存取错位、各消费方"猜字符串"。

## 终态原则（不变量）

1. **单一铸造权威 + 注册表统一判定 + 域隔离（2026-07-10 终版拍板）**：agent target 是 workspace 作用域资源，一切 agent（本地默认 provider 与外部/自定义/shared 接入）统一注册进本地 runtime 目录（target store，`listAgentTargets()` 的数据源）。session 投影出的 `agentTargetId` 必须存在于注册表，否则置空留痕。**禁止从 session 携带的数据（runtimeContext/providerTargetRef 等）推断身份**——判定的唯一依据是注册表。
   - **跨域翻译发生在 host 投影层，不在本地 daemon**：owner 域 target id 是 owner 设备命名空间的私有物，不进入 caller 侧存储。host（tsh/tutti-os）的 SharedAgent binding 记录同时持有 `sharedAgentId` 与 owner `agentTargetId`（1:1，room==workspace 作用域内），owner 会话投影进 caller room 时由 host 在过境点把 `agentTargetId` 改写为 caller 本地规范 id。daemon 摄入侧只做存在性判定；`ResolveAlias` 仅作纵深防御兜底（恒 miss，不加别名列）。
   - shared agent 的本地规范 id **只由 sharedAgentId 派生**：`shared-agent:{sharedAgentId}`（前缀为命名空间卫生，防与 `local:*`/uuid 撞名，与 tsh 既有 `SHARED_AGENT_PROVIDER_TARGET_PREFIX` 约定一致）。owner 域 id 不能做本地主键（owner 分享其 `local:codex` 会与 caller 本机同名 target 撞名）。
   - 边界情况：owner 取消分享后重新分享会铸出新 sharedAgentId，旧会话按 fail-fast 报"agent 不存在"——分享关系确已断过，属诚实行为。
2. **agentTargetId 驱动**：agent-gui 一切 composer 身份（options 缓存、overrides、draft key）取自"已在目录中解析成功的 target"的 id。provider 是从 target 派生的元数据，不做身份。
3. **fail-fast，无兜底**：session 的 agentTargetId 在目录中查不到（且目录已加载完成）→ 会话级错误态"该 agent 不存在或已被移除"，composer 禁用、消息只读。**不回落 provider 维度**（未来分身能力下同 provider 多 target，provider 兜底会合并不同分身的数据，是错误行为）。
4. **缓存键不透明**：activity-core 的 composer options 键是不透明字符串 `targetKey`，存取 round-trip verbatim，不解析、不改写。
5. **providerTargetRef 降级为派生物**：不再作为请求字段传递（推翻原方案 step 1 的"加性 ref 字段"）；需要结构化信息时从目录记录反查。

## 分工作流

### WS0（tuttid/daemon）：引用完整性 —— 前置条件

目标：任何持久化/投影的 session，其 `agentTargetId` ∈ 本地 target 目录，或为空。

1. **shared agent 登记为本地 target（tutti-os 侧依赖）**
   - shared agent 同步到本地时，在 target store 注册（或幂等 upsert）一条本地 target，主键 `shared-agent:{sharedAgentId}`。**不加别名列**——跨域 id 翻译由 host 投影层完成（见终态原则 1），caller 侧存储不认识 owner 域 id。
   - 【2026-07-10 执行后勘误】WS0 调查确认本仓库**不存在** shared agent 注册路径（`agent_targets` 生产写入方仅系统种子），注册属 tutti-os 侧依赖。
2. **session 摄入边界判定（存在性校验，非推断）**
   - 泄漏点：`services/tuttid/service/agent/activity_projection.go:127` —— `AgentTargetID: firstNonEmptyString(input.State.AgentTargetID, input.Source.AgentTargetID)` 未经校验落库。
   - 改法：摄入时 id 在 target store 中命中 → 原样通过；未命中 → 先过 `ResolveAlias` 纵深防御兜底（正常情况下恒 miss——host 已在投影层完成翻译；命中说明上游漏翻，改写并留痕）→ 仍未命中 → 置空 + 原始值留痕（runtimeContext，仅诊断）。
   - **禁止**从 session runtimeContext/providerTargetRef 推断身份——判定唯一依据是注册表。
   - 同类合并路径一并检查：`packages/agent/daemon/activity/runtime_projection.go`、`packages/agent/daemon/activity/client.go` 的 `firstNonEmptyString(...AgentTargetID...)` 合并逻辑（upstream 值须同样过判定）。
3. **存量数据**
   - 读时翻译：已落库 session 的 agentTargetId 经同一判定投影；无人认领置空留痕。（host 翻译上线后新数据天然规范。）
4. **不变量测试**
   - 新增：投影输出的每个 session，agentTargetId 为空或存在于 target store；喂入注册表别名命中的 id 时改写为主键 id；喂入无人认领的 id 时置空且留痕。

### WS1（agent-gui + desktop renderer）：选中 target 驱动 + fail-fast

目标：composer 身份只来自目录中解析成功的 target；解析失败诚实报错。

1. **解析函数统一**
   - session/nodeData 携带的 `agentTargetId` 只作为外键，经 `desktopAgentsService.getAgentTarget()`（目录）解析；命中 → 用目录记录驱动（id、provider、label 等全部取目录值）。
   - 改造点：`packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUINodeController.ts` 的 `composerTargetDataFromNodeData`（:414）与 `composerTargetDataFromProviderTarget`（:337）；砍掉 `agentTargetId ?? providerTargetId` 等猜谜链（如 `packages/agent/gui/workbench/contribution.ts:455-492` 把 providerTargetId 写进 agentTargetId 的兜底）。
2. **legacy 无 id 会话也走目录解析（2026-07-10 补充拍板）**：nodeData/session 完全没有 agentTargetId 外键的旧会话，不保留"按 provider 驱动"的旁路——解析到目录中该 provider 的本地 target（`local:${provider}`，系统种子恒存在），从而获得规范身份；目录已加载且无对应 local target 则同样 fail-fast。禁止在任何层出现 `agentTargetId ?? provider` 形式的键派生。
3. **fail-fast 三态**
   - 目录未加载完成 → loading（不判错，避免启动闪错）；
   - 目录已加载且查不到 → 会话级错误态：composer 禁用 + 文案"该 agent 不存在或已被移除"，历史消息只读；错误限定在该会话，不打挂整个节点；
   - 查到 → 正常。
   - 需要 agentsService 暴露"已加载"状态（目前 `DesktopAgentsService` snapshot 初始为空数组，与"加载完但为空"不可区分——加 `loaded` 标志或以 `capturedAtUnixMs !== null` 判定）。
4. **overrides / draft key 收敛**
   - `composerOverridesByAgentTargetId`、`nodeDefaultDraftKey`（`agentGuiController.composerHelpers.ts:454-462、:597-613`）的键来源自动统一到解析后的目录 id；不做单独迁移，owner 域旧键孤儿化（可接受）。
5. **测试**
   - 解析命中/未命中/加载中三态各一组；shared 会话（目录 id `shared-agent:x`）与 local 会话行为一致；已删除 agent 的会话呈只读错误态；legacy 无 id 会话解析到 `local:${provider}` 后行为与显式 id 一致。

### WS2（activity-core + desktop adapter + tuttid API）：不透明键 + 单一键空间

目标：缓存键契约显式化，键随请求到达 daemon，provider 变派生。

1. **activity-core 接口**
   - `loadComposerOptions({ targetKey, ... })`：`targetKey` 必填、不透明，类型注释写明 "round-trip verbatim; do not parse or rewrite"。
   - 单一键空间：snapshot 改为 `composerOptionsByTargetKey`；删除 `composerOptionsByProvider`、`provider:${provider}` 键、以及 `packages/agent/activity-core/src/controller.ts:263-303` 的双键空间失效逻辑（fail-fast 后每次 load 必有已解析 target，provider 键空间无存在必要）。
   - `invalidateComposerOptions` 仍按缓存值内的 `options.provider` 过滤，不解析键。
2. **API 加性字段**
   - `services/tuttid/api/openapi/tuttid.v1.yaml` 的 `GetAgentProviderComposerOptionsRequest`（:6222）增加可选 `agentTargetId`；重新生成 server/client 代码（`types.gen.go`、`tuttid-ts`）。
   - handler 将其透传到 `ComposerOptionsInput.AgentTargetID` —— 服务层已支持按 target 解析 provider 并回显 `runtimeContext["agentTargetId"]`（见 `service_test.go:2458` `TestServiceGetComposerOptionsResolvesProviderFromAgentTargetID`、`composer_options.go:162`），不需要新逻辑。
3. **desktop adapter**
   - `desktopAgentActivityAdapter.ts:156-179` 的 `loadComposerOptions` 带上 `agentTargetId: targetKey`（目前该字段在请求前被丢弃）。
4. **测试**
   - 键 round-trip：存取同键、不同 targetKey 不串桶；同 provider 两个 target（模拟分身）缓存隔离；invalidate 按 provider 过滤仍生效。

## 顺序与发布

- **WS0 → WS1 →（或同批）→ WS2。**
- 硬约束：WS1 的 fail-fast 不得先于 WS0 的翻译上线——否则存量 shared 会话（携 owner 域 id）会假报"agent 不存在"（该 agent 在本地目录明明存在，只是 id 未翻译）。
- WS2 依赖 WS1 的"每次 load 必有 targetKey"，可紧随或同批。
- 迁移成本：composer options 缓存可重取，无迁移；overrides 旧键孤儿化，接受。

## 验收（端到端）

1. rail 选中 shared agent → 加载 composer options → 切到该 agent 活跃会话 → 缓存键前后一致，无重复请求、无错位读取。
2. 同 provider 两个 target 的 options/overrides 互不污染。
3. 删除一个 agent 后打开其历史会话：只读 + "该 agent 不存在或已被移除"，节点其余会话正常。
4. 全链路 grep 无"从 session 取 agentTargetId 直接当键/直接驱动 UI"的残留路径；无 `agentTargetId ?? providerTargetId` 兜底链残留。
5. daemon 不变量测试：任何 session 投影的 agentTargetId ∈ 本地目录或为空。
