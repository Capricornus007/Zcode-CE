# 154 Windows deep-link 启动参数注入加固(X11)

> 移植自上游 zai-org/ZCode v3.15.1(aac47556,Apache-2.0):packages/desktop/src/main/desktopOAuthDeepLink.ts 的协议注册加固。
> 修改文件:packages/desktop/src/main/desktopOAuthDeepLink.ts(2 处 + 中文注释)。矩阵原标 B(判别是否已修),已判别 CE 未修→ 提级 A,Lead 已复验批准。

## 漏洞与修法

Windows 上 `app.setAsDefaultProtocolClient(scheme)` 生成的注册表命令行是 `<exe> "%1"`。Windows 的引号拆分(尤其 URL 含特殊字符时)可把 URL 内容拆成多个参数,其中以 `--` 开头的片段会被 Electron 当作启动开关(早于应用 JS 与单实例锁,inspector/GPU/js-flags 等开关可被注入)。修法:注册时在 URL 位置前插一个 `--` 终止符,electron 的参数解析在 `--` 之后不再把后续参数视为开关,URL 内容整体成为普通 argv 项,后续由 `extractDeepLinkUrlFromArgs` 与 `handleDeepLink` 的既有白名单校验处理。

```
// defaultApp 分支:开发态入口路径也要带上终止符
const args = process.platform === "win32" ? [entry, "--"] : [entry];
app.setAsDefaultProtocolClient(scheme, process.execPath, args);
// 打包态分支
const ok = process.platform === "win32"
  ? app.setAsDefaultProtocolClient(scheme, process.execPath, ["--"])
  : app.setAsDefaultProtocolClient(scheme);
```

- 非 win32 不变:Linux 的 xdg 注册带 %u,macOS 由 LaunchServices 传 URL,均无此拆分问题。
- CE 的 `extractDeepLinkUrlFromArgs` 用正则扫全部 argv 候选(含相邻 argv 拼接),URL 位于 `--` 之后不影响提取,无需改动 deep link 解析链路。

## 验证

- 单测: CE 现有 desktopOAuthDeepLink 注册函数若有测试则增补断言 win32 分支 args 含 "--"(读 setAsDefaultProtocolClient mock 调用参数);
- 人工/CI:Windows 注册表命令行核对(`zcode://--inspect=...` 类 URL 启动后无 inspector 打开)。CI 无 Windows runner 时记录为真机待验证项。

## 移植分类

A(与上游逐行一致)。
