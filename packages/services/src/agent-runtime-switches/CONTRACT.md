# agent-runtime-switches

Agent 运行期的两个能力开关判定：独立 plan 支持度与输入预测开关的解析。开关以能力探测结果为准，缺省关闭；判定只在这一处，不在其它层复制。

层：`{ app: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
