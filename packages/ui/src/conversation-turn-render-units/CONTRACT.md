# conversation-turn-render-units

会话 turn 渲染单元的类型定义：渲染单位、分组与过滤契约。只描述投影形状，不持有渲染状态，也不参与 canonical 消息写入。

层：`{ app: . }`。owner：`conversation`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
