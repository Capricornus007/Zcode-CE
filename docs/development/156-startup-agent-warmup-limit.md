# 156 多工作区启动预热收敛(X12)

> 移植自上游 zai-org/ZCode v3.15.1(aac47556,Apache-2.0):packages/desktop/src/main/startupWorkspace.ts 的 STARTUP_AGENT_WARMUP_LIMIT 3→1 + packages/desktop/src/host/index.ts 注释同步。
> 矩阵原标 B(先复现判别);已判别 CE 未修、上游确系此修法 → 提级 A,Lead 已复验批准。

## 原因(上游注释与实测)

会话 CLI 没有 idle 回收;启动预热 3 个 workspace 会让每个窗口常驻 3 份 Agent 进程内存。切到最近项目的冷启动收益抵不上常驻成本,因此收敛为只预热 active workspace(与协议 init-local 的 agentWarmupTargets 上限 1 保持一致)。

## 修改

1. packages/desktop/src/main/startupWorkspace.ts:
   - `const STARTUP_AGENT_WARMUP_LIMIT = 3` → `export const STARTUP_AGENT_WARMUP_LIMIT = 1`(上游为 export,供测试断言)。
   - 注释改为上游口径:「会话 CLI 没有 idle 回收,启动预热 3 个会让每个窗口常驻 3 份 Agent 进程内存;切到最近项目的冷启动收益抵不上常驻成本,收敛为只预热 active workspace。」
2. packages/desktop/src/host/index.ts(约 2845 行 warmUpZCodeAgent 前的注释):
   - 「Main 已按最近使用顺序把启动预热限制为 3 个」→ 「Main 已把启动预热限制为 active workspace 1 个」,行为描述同步(Host 本就要显式消费固定名单、不隐式扩大、不补位,这部分注释保留)。

- resolveStartupAgentWarmupTargets 的其余逻辑(candidates 去重、limit 截断)不变;limit 由 3 变 1 后自然只返回 active。
- 上游另有 `resolveStartupWorkspacePath` 导出(给 telemetry/其它入口用),CE 无消费点,不引入。

## 验证

- 单测:startupWorkspace 既有测试增补——STARTUP_AGENT_WARMUP_LIMIT === 1 且 resolveStartupAgentWarmupTargets 返回值最多 1 个(需把该函数改 export,与上游一致)。
- 行为验证:多 workspace 恢复启动时,只有 active workspace 的 Host 收到 warmup 目标(日志确认 local host init 1/1)。

## 移植分类

A(常量与注释;host 侧注释 Lead 已把 packages/desktop/src/host/ 加入我的写范围)。
