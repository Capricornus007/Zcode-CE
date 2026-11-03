# source-server-device-settings

设置页的 Source Server 设备视图：状态 hook、设备行、更新活动与列表派生纯函数。设备事实来自服务端口，本模块只做展示投影，不缓存第二份连接状态；超大面板外壳另按例外登记，待拆分后再纳入。

层：`{ app: . }`。owner：`desktop-settings`。

不变量：

- 本模块只登记既有实现的实际依赖方向，不新增跨模块导入路径，也不改动实现本身的归属。
- 调整公开面时同步更新本目录的 contract.ts 与 architecture-policy.yaml（检查器校验两者一致）。
