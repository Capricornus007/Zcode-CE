# cli-model-request-attribution

模型请求的归因 header 与能力声明：session-type 推断、内部前缀剥离、tool-search 能力到 header 的映射。两个文件都是从 runner-status.ts 拆出的纯函数，公开面仍由原文件导出，本模块只登记这些实现。

层：`{ adapters: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
