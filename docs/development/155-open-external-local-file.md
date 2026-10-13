# 155 内置浏览器打开本地文件失败(X5)

> 移植自上游 zai-org/ZCode v3.15.1(aac47556,Apache-2.0):desktopMainIpcHelpers.ts 新增 openFileUrlInDefaultApp + desktopMainIpcRemote.ts 的 OpenExternal 处理器分支。
> 修改文件:packages/desktop/src/main/desktopMainIpcHelpers.ts(新增函数)、packages/desktop/src/main/desktopMainIpcRemote.ts(file: 分支)。

## 背景

内置浏览器/普通页面经 `window.zcode.openExternal`(OpenExternal IPC)打开外链时,main 侧用 `shell.openExternal(url)`。`shell.openExternal` 对 `file:` 协议在很多平台实现上失败或无效果,导致「用默认浏览器/应用打开本地文件」入口失败。

修法(与上游一致):

1. helpers 新增:
   - `openFileUrlInDefaultApp(url, logger)`:`fileURLToPath(url)` → 复用 CE 已有的 `openPathInDefaultApp(path, logger)`(它做 realpath + 平台特定的默认应用打开)。
   - 失败 warn `[open-external] file URL 打开失败`,不向上抛。
2. OpenExternal 处理器(`ipcMain.on(PlatformChannels.OpenExternal)`)在校验通过(`isAllowedExternalOpenUrl`,已含 file:)之后、sender 归属判断之前,插入:
   - `if (new URL(url).protocol === "file:") { void openFileUrlInDefaultApp(url, logger); return; }`

- 安全校验前置不变:file: 仍须通过 `isAllowedExternalOpenUrl` 的协议白名单与既有 sender 校验后才走到分支。
- codingPlan 的 PayPal 中转判定在 file: 分支之后才需要,提前 return 不影响。

## 验证

- 单测:openFileUrlInDefaultApp 对 file:///path 的转换与失败路径(mock openPathInDefaultApp);OpenExternal 处理器对 file: 输入走 openFileUrlInDefaultApp 而非 shell.openExternal。
- 手动:内置浏览器打开一个 file: 链接,默认文件管理器/应用应打开。

## 移植分类

A(与上游逐行一致)。
