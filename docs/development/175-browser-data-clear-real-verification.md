# 175 · X3 遗留清除: 内置浏览器数据清理的真实 Electron session 语义验证(task-19)

> 状态:**已验证(真实 Electron 断言通过), 探针一次性产物已清理**。X3 遗留的"只过桩链路"就此闭合。

## 0. 背景

`clearEmbeddedBrowserData`(packages/desktop/src/main/browserDataManager.ts:210-231)此前只有 stub 链路测试(packages/desktop/test/pluginSandboxClearOrder.test.ts + electronStub.mjs), 没有验证过真实 Electron session 的清理语义。task-19 要求用 electron 41.0.3(dev dep)跑一次真实 session clear 断言。

## 1. 被验证的实现(语义来自源码)

- partition: `persist:zcode-embedded-browser`
- mode=all: `clearCache() + clearStorageData()` —— 全清(含登录态)
- mode=cache: `clearCache() + clearStorageData({ storages: ["shadercache", "serviceworkers", "cachestorage"] })` —— 只清缓存类存储, **保留承载登录态的 LocalStorage/IndexedDB 与 cookie**(源码注释明确)

## 2. 真实断言(electron 41.0.3, DISPLAY=:0, 无 xvfb)

环境: electron 二进制经 `node install.js` 补齐(node_modules/electron/dist 缺失, 首次探测报 "failed to install correctly"); DISPLAY=:0 存在故无需 xvfb。

断言方式: 本地 http server(127.0.0.1 随机端口)提供 origin, BrowserWindow(不可见, session=目标 partition)写 cookie + localStorage, 再按两种 mode 清理后回读。**4/4 全部通过**:

1. mode=all 清除全部 cookie(`s.cookies.get({}).length === 0`) ✓
2. mode=all 清除 localStorage(`localStorage.getItem('probe') === null`) ✓
3. mode=cache 保留 cookie(登录态)(length === 1) ✓
4. mode=cache 保留 localStorage(登录态)(值不变) ✓

## 3. 结论与处置

- **结论**: 实现的 session clear 语义与 Electron 真实行为一致; mode=cache 的登录态保留是真实有效的(Electron clearStorageData 的 storages 白名单语义成立), 不只是 stub 的断言。
- **处置(路 2: 一次性验证)**: 结论写入本 spec; 探针目录 packages/desktop/test/.real-probe/ 已整体删除(3.5MB esbuild 打包件含 559 处 \*\* 注释, 曾刷红 copyFormatGuard 棘轮基线 0→7; 删除后棘轮恢复 11/11 全过)。
- 打包件教训: esbuild bundle browserDataManager.ts 会拉入 chrome\* 管理器的 CJS 运行时链(dynamic require of events/bufferutil, 顶层 node:sqlite 初始化卡死), 无法在 Electron ESM 主进程直接跑; 最终改为纯 Electron session API 断言(常量与源码 fact-check 一致), 封装逻辑的参数正确性仍由既有 stub 测试覆盖。
- 后续若需回归: 可按本 spec §2 的方式重建探针(node:http + BrowserWindow + session cookies/localStorage 断言)。
