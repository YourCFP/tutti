# 消息中心「需要关注」抽牌卡组 — 设计文档

- 日期：2026-06-12
- 承载面：右侧消息中心抽屉（`WorkspaceAgentMessageCenterPanel`）
- 目标分支：从 `main` 切 worktree 实现

## 背景与需求

消息中心抽屉当前把所有会话项放进分组列表（优先级 / 状态 / 智能体 / 时间），
「需要关注」的项按时间倒序平铺在分组里，同 provider 的折叠成小摞。缺口：

1. 没有「逐张处理」概念——多张待办同时摊开，注意力分散。
2. 点完一张就地消失，不会主动把下一张顶上来。

用户需求（原文）：

1. 当需要关注的时候，卡片应该按照**先进后出（LIFO）原则堆叠，最新的需要关注的卡片在最上**。
2. 如果涉及到交互，**在最上的卡片应该可交互**（比如可以点击选项）。
3. **点击选项之后，应该自然流转到下一个可交互的卡片**。

## 决策记录（已与用户确认）

- **承载面**：改造右侧消息中心抽屉（不是画布节点，也不是新建浮层）。
- **布局方案**：抽牌卡组（一摞牌，最上 1 张完整可交互，下方露边；处理完顶卡飞走、下一张升顶）。
- **卡组与现有分组/筛选的关系**：
  - 卡组**跨所有 provider/会话合并成一摞**（不按 provider 拆小摞）。
  - 卡组**钉在面板顶部，不受分组模式 / 筛选器影响**；分组与筛选只作用于卡组以下的常规列表。
- **卡组成员范围（方案 A）**：卡组**只收「可交互」的卡，即 `pendingPrompt !== null`**。
  纯 `needsAttentionKind`（失败 / 无选项提醒）不进卡组，留在下方常规列表照旧。
- **新卡插入策略（方案 2）**：新到的可交互卡**插到最顶**成为新的可交互卡，
  但对新晋顶卡施加 **~500ms 防误触冷却**（期间禁用选项点击与键盘快捷键，鼠标 hover 可看内容）。

## 现状关键事实（实现依据）

- 数据模型 `WorkspaceAgentMessageCenterItem`（`workspaceAgentMessageCenterModel.ts`）：
  - 消息中心**按会话（session）聚合**，每会话一项；每会话**最多一个 `pendingPrompt`**。
  - `pendingPrompt: AgentConversationPromptVM | null` = 可交互（approval / ask-user / exit-plan）。
  - `needsAttentionKind` = 需要关注但可能不可交互。
  - `isWaitingMessageCenterItem` = `pendingPrompt !== null || needsAttentionKind !== null`。
  - 排序 `compareMessageCenterItems`：waiting 优先，组内按 `sortTimeUnixMs` **降序**（最新在前）。
    —— 卡组 LIFO 顺序天然满足，无需改排序函数。
- Panel（`WorkspaceAgentMessageCenterPanel.tsx`）：
  - `visibleItems` = 经筛选器过滤；`itemGroups` = `groupMessageCenterItems(visibleItems, groupBy)`。
  - 每会话渲染 `WorkspaceAgentMessageCenterCard`（`pendingPrompt` 存在时内嵌交互面）。
  - 已有 `submitPrompt(item, input)`：`onSubmitPrompt` → 后端解析 → 该会话 `pendingPrompt` 变 null → 移出 waiting。
  - 已有 `highlightedItemId` 滚动定位 + provider stack 自动展开逻辑。

## 设计

### 1. 数据划分（model / viewModel 层）

- 新增选择器：**卡组成员 = `items.filter(item => item.pendingPrompt !== null)`**，沿用现有降序（最新在最上 = LIFO）。
- **其余项**（含 `needsAttentionKind` 无 prompt 的失败 / 提醒、working、completed）→ 走现有
  `itemMatchesViewFilters` + `groupMessageCenterItems`，照旧。需从分组输入里**剔除卡组成员**，避免重复出现。
- `model.counts` 与顶部 summary 文案沿用现有定义，不改。卡组自身计数 = 成员数。

### 2. 组件结构（Panel 层）

- 新建 `WorkspaceAgentMessageCenterAttentionDeck`（同目录 `.tsx` + spec）：
  - 入参：已排序卡组成员、`highlightedItemId`、提交回调、submitting 状态、节点 ref 注册器。
  - 渲染最上 1 张为**完整可交互**卡（复用 `WorkspaceAgentMessageCenterCard`）。
  - 下方最多露 2 张边缘：`translateY` + `scale(<1)` + 降透明度 + `pointer-events:none`，纯视觉。
  - 底部「▾ 下面还有 N 张」（N>0 时）。
- `WorkspaceAgentMessageCenterCard` 增加 `interactive?: boolean`（默认 `true`）：
  为 `false` 时不渲染 / 禁用内嵌交互面（用于 behind 卡与防误触冷却期）。
- Panel 渲染顺序：**卡组（钉顶）** → 现有 `itemGroups` 列表（已剔除卡组成员）。

### 3. 流转与防误触（交互核心）

- **提交**：复用现有 `submitPrompt`。该会话 `pendingPrompt` 变 null 后自动移出卡组。
- **流转动画**：顶卡提交后「飞走」（`translateY(-14px)+scale+fade`，~360ms），结束后下一张升顶并播微动画。
  `motion-reduce` 下无动画、直接切换。
- **新卡插顶冷却（方案 2）**：
  - 以**顶卡 `requestId`** 为 key 跟踪。顶卡 `requestId` 变化（新卡插顶，或上一张处理掉换人）时，
    对新晋顶卡启动 **~500ms 冷却**：选项按钮 `disabled` 且全局 `Enter / ⌘Enter` 快捷键忽略该卡。
  - 用 `requestId` 作 key，避免每次 render 重置冷却计时。
- 键盘快捷键（`Enter`=第一项、`⌘Enter`=第二项）**只作用于顶卡**；behind 卡不监听。

### 4. 边界情况

- **卡组为空**：不渲染卡组区，顶部直接是常规分组列表（与今天一致）。
- **只有 1 张**：正常单卡，无 behind 边缘、无「还有 N 张」。
- **highlightedItemId 命中卡组内某张**：把该张**临时提到顶层**并**跳过冷却**（用户主动点击进入，不算误触），
  让其直接可操作；highlight 结束后恢复 LIFO 顺序。
- **筛选器**：不作用于卡组（钉顶恒显）；现有「命中 highlight 时重置筛选」逻辑只针对下方列表。
- **provider 折叠**：卡组不折叠（跨会话合并成一摞）；下方列表保留 `partitionMessageCenterItemsByProvider`。

## 测试

- model / viewModel 层：
  - 卡组成员筛选 = 仅 `pendingPrompt !== null`；下方列表不含卡组成员。
  - 卡组顺序 = `sortTimeUnixMs` 降序（最新在最上）。
- Panel / Deck 层（spec.tsx）：
  - LIFO 顺序渲染；仅顶卡可交互，behind 卡禁用。
  - 提交顶卡后流转到下一张。
  - 新卡插顶 → 冷却期内选项 / 快捷键不生效，冷却后恢复。
  - highlightedItemId 命中卡组 → 提顶且可操作。
  - 空 / 单张边界。

## 非目标（YAGNI）

- 不改后端 / prompt 解析逻辑。
- 不改画布节点（B）与会话内 transcript 卡（C）。
- 不新增分组模式 / 筛选维度。
- 不引入对 `needsAttentionKind`（不可交互）卡的新「确认 / 跳过」动作——它们留在常规列表。
