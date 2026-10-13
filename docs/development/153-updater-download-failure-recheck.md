# 153 更新下载失败后复查新版本(X3)

> 移植自上游 zai-org/ZCode v3.15.1(aac47556,Apache-2.0):packages/desktop/src/main/autoUpdater.ts 的 recheckAfterDownload 机制与轮询节奏改造。
> 修改文件(加 Modified by ZCode: 标记):packages/desktop/src/main/autoUpdater.ts 精确移植下列机制,不动 CE 自研的 provider/darwin/https 等链路。

## 上游修法(已逐行对照 diff 取证)

1. recheckAfterDownload 门面(模块级 `let recheckAfterDownload: ((reason: string) => void) | null = null` + `pendingFailedDownloadRecheck`):
   - 下载失败(`handleAutoUpdateFailure` 里 failedDownload 且无强更监听)立即 `recheckAfterDownload('download-failed')`;下载完成(`update-downloaded`)也 `recheckAfterDownload('download-finished')`(发现已下载版本被更高版本取代)。
   - 检查进行中时把 download-failed 记为 pending,等 `finishAutoUpdateCheck` 收口后再查(queueMicrotask),避免复查被进行中的检查直接丢掉。
2. 轮询节奏:`AUTO_UPDATE_POLL_INTERVAL_MS` 60min→15min;新增 `AUTO_UPDATE_VISIBLE_POLL_INTERVAL_MS` 2min(已有可见更新目标 update-available/update-downloaded 时);`canPollForUpdatesFromState` 加入 update-available;`ensureAutoUpdatePollInterval` 按状态在菜单状态变化时重建定时器(download-progress 时停轮询);轮询回调改为 `recheckAfterDownload('poll')`(复用同一门面)。
3. checking-for-update 事件:已有可见目标或下载中时不把菜单闪成 checking(保留已发现版本,结果回来再替换)。
4. already-up-to-date:ready 包仍是当前目标时回 ready;有可见目标时回 available(带版本与通道),不清掉已展示的目标。
5. check failed 且有可见目标且无强更:走 error + manualCheckResult,不清空 available/downloading。
6. `isReadyUpdateCurrentTarget()`:quitAndInstall 前校验 ready 包版本仍等于当前菜单目标,目标升高时不装旧包(checkForUpdateMenuClick 同理:update-downloaded 且目标一致才安装,否则落到重新检查)。
7. `autoInstallOnAppQuit = false`(全平台)+ initAutoUpdater 内 `app.on('before-quit')`:非 win32 且非 in-flight 且 ready 是当前目标时 preventDefault 并 quitAndInstallUpdate。

## 实施记录(2026-10-13 落地)

- 已落地 1/2/3/4/5/6/7 全部七点;新增单测 `autoUpdaterDownloadRecheck.test.ts`(2 项:update-downloaded 自动复查;有可见目标时手动检查不闪 checking 且 check failed 不清目标 + update-not-available 保留目标)。17 个 desktop 测试文件 105 项回归全过。
- **未移植** `requestAutoUpdateCheckWithoutWindow`(上游给无窗口远控/强更入口用):CE 无消费点,不引入。
- `skipAvailableUpdateVersion`/`downloadAvailableUpdate`/`cancelDownloadingUpdate` 保持 CE 的模块内可见性(上游为导出,仅服务于上述未移植函数)。
- before-quit 主动安装与 index.ts 既有 `prepareAppQuit("auto-update quitAndInstall", "update-install")` 衔接:退出屏障先回收 host/agent 再进入安装器,与既有"重启以更新"按钮同一安装路径。darwin 正式包在 initAutoUpdater 早期跳过分支内返回,before-quit 处理器不会注册(未签名包无更新链路)。
- A1 联动:本变更引入了"非 win32 退出时的主动安装"链路(第 7 点),157 的重开条件相应生效——该链路若有卡死报告,需按 3.15.3 的 ot 锁形态重开 A1。

## CE 适配点(与上游的结构差异,不照搬的部分)

- CE 有自研链路必须保留:usesManifestUpdateProvider(打包态读 app-update.yml 走 GitHub Release)、autoUpdateUnavailableOnDarwinRelease + autoUpdateAvailability(未签名 macOS 包跳自动更新,spec 136)、更新源覆盖只接受 https、resolveUpdateReleaseChannel 在原生 provider 下固定 stable。
- CE 的 `applyUpdateProvider`(CE 名)与上游 `applyManifestUpdateProvider` 语义不同:CE 按构建目标决定 provider,移植时只取上述 7 点机制,provider 函数保持 CE 实现。
- CE 现有 `autoInstallOnAppQuit = process.platform !== 'win32'`:改为全平台 false 会改变 macOS/Linux 既有「退出即装」行为——需与 before-quit 主动安装(第 7 点)一起移植,否则非 win32 会丢失退出安装能力。移植时**成对落地**并加测试。
- `requestAutoUpdateCheckWithoutWindow`(无窗口场景的更新检查,上游给远控/强更门控用)与 CE 远控形态相关,评估后决定是否移植(CE 暂无接线点则不引入)。

## 验收场景

- 模拟下载失败(注入 failedDownload)后自动发起一次更新检查,而不是停在 idle 让用户手动点。
- 检查进行中的下载失败在收口后补查一次(pending 标志被消费且只消费一次)。
- 有 update-downloaded 目标时轮询为 2min,无目标时 15min;download-progress 时无轮询定时器。
- ready 目标被更高版本取代后,菜单/手动检查不会装旧包。

## 测试

- 单测:recheckAfterDownload 在 in-flight 时的 pending 语义、resolveAutoUpdatePollInterval/ensureAutoUpdatePollInterval 的定时器重建、isReadyUpdateCurrentTarget 的目标守卫。autoUpdater 的状态机既有测试若有需同步调整(先跑一遍看现状)。

## 移植分类

A(行为照搬 + CE 链路保留)。
