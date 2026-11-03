# cli-dynamic-workflow-causality

workflow 脚本因果序分析的 AST 走查件：绑定解析、调用/循环/分支走查、strand 与 settle 记账、类型与状态定义。都是 causality-order.ts 撞行数上限后拆出的纯分析件，公开面仍从 causality-order.ts 导出，不引入执行副作用。

层：`{ app: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
