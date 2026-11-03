# remote-identity-migration

控制器远端身份的一次性迁移：把旧记录补成当前 workspaceIdentity 口径。迁移只在启动期按存在性执行，不改变 session 记录的 owner，也不重复改写已迁移的行。

层：`{ app: . }`。owner：`conversation`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
