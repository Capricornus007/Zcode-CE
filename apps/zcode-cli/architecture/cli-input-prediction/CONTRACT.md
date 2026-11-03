# cli-input-prediction

手机远控的输入预测（ghost hint）：v4/conversation/inputPrediction 的 CLI 侧处理器，与会话近期上下文的候选生成 sidecar。同一会话只保留一个进行中的预测，新请求到达即中止旧的；预测只产出候选文本，不提交输入、不改变 canonical 会话。

层：`{ app: . }`。owner：`remote`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
