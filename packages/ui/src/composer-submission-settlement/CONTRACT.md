# composer-submission-settlement

composer 提交结算的纯函数：把已提交输入与草稿、组合态的清理规则算成结算结果。accepted 队列的事实归 runtime，UI 只保留未提交草稿与乐观叠加。

层：`{ app: . }`。owner：`conversation`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
