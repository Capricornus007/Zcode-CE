# ui-request-security-edition

UI 侧的请求安全版本错误面：把验证与风控相关错误整理成可展示的文案与判定，供提示和重试入口使用。策略与协议侧事实归 shared 的同名实现，本模块只做 UI 侧映射。

层：`{ app: . }`。owner：`conversation`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
