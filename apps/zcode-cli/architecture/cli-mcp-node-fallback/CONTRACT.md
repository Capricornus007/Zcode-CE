# cli-mcp-node-fallback

为 MCP 服务器提供「随包 Node 与 npm」兜底：渲染 shim 目录、拼出 PATH 与 npm root 环境变量，并把 provider 组装成 bootstrap 可用的运行时。真实 node 可用时不介入，兜底只影响子进程环境，不改变 MCP 会话所有权。

层：`{ adapters: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
