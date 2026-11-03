# personalization-settings

设置页个性化分区：主题、字号与界面偏好的选择与写回。写入仍走既有 settings 端口与广播防回环，本模块只登记该分区的呈现与交互。

层：`{ app: . }`。owner：`desktop-settings`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
