# source-server-management

Source Server 管理面的服务实现：设备侧连接与更新信息的聚合，供设置页与桌面入口读取。它只做编排与错误归类，真正的 transport 归 source-server-transport。

层：`{ app: . }`。owner：`remote`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
