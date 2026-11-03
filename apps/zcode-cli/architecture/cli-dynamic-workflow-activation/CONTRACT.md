# cli-dynamic-workflow-activation

动态工作流工具面的按需激活：初始可见性判定、激活标记的持久化与 resume 复原，以及内联草稿记作「模型写过的文件」的读态登记。激活一次即写审计条目，不建立第二份状态来源。

层：`{ app: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
