# cli-node-repl-host

node REPL host 的 CUA 桥接面：broker 与 bridge 两段转发、结果封装、工具契约与「无进展」守卫。host 只转交本机 CUA 能力，不持有 session 状态；调用账本归 node-repl-call-ledger。

层：`{ adapters: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
