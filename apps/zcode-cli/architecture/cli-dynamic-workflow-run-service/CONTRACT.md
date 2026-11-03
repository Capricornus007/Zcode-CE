# cli-dynamic-workflow-run-service

动态工作流的 run 服务：submit/amend/resume 三条启动入口与「编译一次」语义、额度停止的 run 到点自动续跑、AgentRuntime-backed driver dispose 时的会话释放与静默账本。run 与 actor session 的生命周期归本模块，driver 只负责执行。

层：`{ app: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
