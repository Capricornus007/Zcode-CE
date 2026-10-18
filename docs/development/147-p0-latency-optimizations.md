# 147 · P0 延迟优化：unsubscribe / git.refresh / workspace presentation 计时

## 证据

从 `dev-restart.log` 的 host RPC 计时：

- `zcode-agent.unsubscribeConversationV4 OK (4171.4ms)` / `(2438.5ms)`；
- `git.refresh OK (897.4ms)`，且在多个时间点反复出现（829–1389ms）；
- `zcode-session.readWorkspacePresentation OK (6495.5ms)`；
- `zcode-session.readSession OK (5055.1ms)`，同一时刻 `conversationPlansV4` / `resync` / `unsubscribe` 都排在它后面完成。

## 根因与修复

### 1. unsubscribe 不应拉起新 runtime

**根因**：`unsubscribeV4Route` 调 `getReadOnlyClient(params)`（默认 `start-if-needed`）。日志里 keep-warm 过期后，renderer 先关闭会话再 unsubscribe，旧实现为了发一条清理请求重新冷启动 CLI，表现为 2–4s。

**修复**：unsubscribe 固定用 `"existing-only"`；运行时已停时直接遗忘本地 route（host 已没有订阅），不再冷启动。

### 2. git.refresh 1s 合并

**根因**：UI 挂载/聚焦/切 tab 会相邻触发多次 `refresh`，每次约 0.8–1.4s 的 `git status`。

**修复**：服务端按 `workspacePath + includeIdentity + includeBranchComparison` 做 in-flight 合并 + 1s TTL 缓存；`stage/unstage/discard/commit/push/switchBranch/createBranch` 成功后主动失效。TTL 内的重复读取返回同一份快照。

### 3. workspace presentation 分段计时

在 `readWorkspacePresentation` 里记录 `timings.clientMs / syncMs / requestMs`，区分「冷启动 CLI」「provider 配置同步」「实际 RPC」；本轮不改变行为，先拿到下一轮优化依据。

## 边界

- git 缓存最多陈旧 1s；写操作立即失效。跨进程写（agent 直接改文件）仍由现有的 watcher/自动刷新兜底，自动刷新本身有 60s 防抖。
- unsubscribe 只清理本地 route 与已存在 runtime 的订阅；不会为了让清理成功而创建进程。
- workspace presentation 只加观测字段，不改变返回内容。

## 验证

- `packages/services/test/gitService.test.ts` 20/20（新增 1s 内复用快照用例）；
- `packages/services/test/zcodeAgentService.v4.test.ts` 48/48；
- `pnpm typecheck` 通过。
- 未执行：重启后真实日志对比（需重新构建 host 后观察 `timings` 与 `git.refresh` 频率）。
