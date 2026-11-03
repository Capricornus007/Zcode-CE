# web-remote-control-relay-protocol

自托管 Web 远控的「已确认」中继消息协议：类型定义与编解码、确认序列的纯协议实现。它是客户端 SDK 侧的协议镜像，投递与重放语义由 desktop/web 两端各自的 owner 负责。

层：`{ app: . }`。owner：`remote`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
