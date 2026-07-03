// mention://room-message 的 wire scope 键约定(协议契约见 tsh 仓
// openspecs/proposals/room-message-mention-contract.md):房间标识的 scope 键固定为
// legacy 命名 `roomId`(跨仓字符串契约,不可改)。agent-gui 生产代码禁用该命名
// (check-agent-activity-runtime-boundaries),故把唯一的键读取收敛到本 shared 模块,
// 包内模型一律用 workspaceId(roomId ≡ workspaceId)。
export function roomMessageMentionWorkspaceIdOf(
  scope: Readonly<Record<string, string>> | undefined
): string {
  return scope?.roomId?.trim() ?? "";
}
