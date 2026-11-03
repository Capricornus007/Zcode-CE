# cli-project-memory

项目记忆的回写与预取：待整理会话的挑选、dream 落盘、召回预取的启动/消费/失效与 dispose。记忆是派生缓存，失败不阻断 turn；写入路径只在本模块，runtime 只在边界点调用。

层：`{ app: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
