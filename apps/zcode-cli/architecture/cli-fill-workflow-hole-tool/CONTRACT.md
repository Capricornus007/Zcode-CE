# cli-fill-workflow-hole-tool

fill_workflow_hole 工具的输入输出 schema 与「这个 run 是否属于本会话留白」的归属判定。工具只给正在等代码的留白补函数体，schema 之外的执行仍由 dynamic-workflow 侧负责。

层：`{ app: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
