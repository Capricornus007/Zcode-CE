# remote-connection-tags

远端连接标签的展示组件：把连接状态与设备种类渲染成标签集合。它是纯展示件，状态判定与流程 owner 留在 remote-connection-flow。

层：`{ app: . }`。owner：`remote`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
