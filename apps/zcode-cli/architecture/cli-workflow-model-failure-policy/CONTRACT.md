# cli-workflow-model-failure-policy

workflow 内的模型侧错误策略表：额度码、连续未识别码上限、配额重置时间解析，以及「workflow 要不要停下来找人」的判定。它与主对话的 failure-classifier 在 3008/3009/3010 上答案相反，因此独立成模块，不共用重试口径。

层：`{ adapters: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
