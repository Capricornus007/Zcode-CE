# cli-off-peak-turn

离峰任务的模型绑定与 turn 收尾：用 async_hooks 保存当次 ticket 权威，接管后以最新绑定刷新 turn、判定是否用户主动接管。绑定只影响该次取号请求，不回写常规会话的模型选择。

层：`{ app: . }`。owner：`agent`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
