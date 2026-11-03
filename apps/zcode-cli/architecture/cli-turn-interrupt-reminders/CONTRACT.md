# cli-turn-interrupt-reminders

turn 边界的三件小事实：用户中断的工具结果补标注、runtime reminder 消息的构造与持久化（含降级取模型）、本轮工具可见面。reminder 走同一持久化通道，不另开第二份消息来源。

层：`{ app: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
