# 157 更新退出状态机评估(§3 A1)——结论:不照搬

> 评估对象:CLOSED-DIFF-3151-3153.md §2 F3 / §4 A1(3.15.3 闭源修复「更新时应用无法正常退出」:main/index.js 的 ot 状态机 + recoverFromFailedUpdateInstall)。本文档是**评估结论**而非实现 spec:批准不移植,记录依据与重开条件。

## 闭源修复做了什么(取证见 CLOSED-DIFF §2 F3)

- 新增 update-target-lock 状态机(`ot` 变量:idle / recovering…):`isUpdateTargetLocked`、`recoverFromFailedUpdateInstall`(安装失败于关机已开始时 relaunch+exit(0) 自恢复)。
- 在更新回调各入口插入守卫(triggerCheckForUpdates 顶部、update-available 处理器、手动检查前),before-quit 处理器改为判锁。
- 目的:串行化「退出」与「更新安装」两个会互相覆盖的状态机,避免关机已开始但安装失败时应用卡死(用户须强制退出)。

## CE updater 现状(2026-10-13 实测,packages/desktop/src/main/autoUpdater.ts + index.ts)

1. CE 无上游 3.15.1 那条「before-quit 触发安装」链路:autoInstallOnAppQuit = process.platform !== 'win32'(macOS/Linux 退出即装,Windows 要求显式点更新),initAutoUpdater **没有** before-quit 处理器。上游 3.15.1 已有该处理器、并与 update-available/update-downloaded 状态机交叉,3.15.3 的 ot 锁是给这个交叉补的锁。
2. CE 已有的保护(自研,与 ot 锁目的部分重叠):
   - quitAndInstallInFlight 抑制重复安装;
   - `prepareAppQuit('auto-update quitAndInstall', 'update-install')` + `selectAppShutdownPolicy`(appShutdownPolicy.ts):更新请求晚于普通退出屏障时显式 join,保留既有 timer 预算,允许更新继续进入安装器;
   - macOS 先通知 main 进入允许关窗状态再交控制权给 updater(避免「界面消失但进程没退」);
   - onBeforeQuitAndInstall 失败回退 handleAutoUpdateFailure 而不是硬启动安装器(避免半更新);
   - dev 态 relaunch fallback。
3. 卡死路径复现尝试:CE 的退出路径(`before-quit` → prepareAppQuit 异步屏障 → 二次 app.quit / exitPreparedApp)在安装失败时不会「等待」 updater——quitAndInstall 失败只让 electron-updater 抛 error 事件,app.quit 的退出流程不被阻止。`before-quit` 处理器的 preventDefault 只在 `!hasPreparedAppQuit` 时发生,而 quitAndInstallUpdate 已先 await 过 prepareAppQuit,两者不会互相覆盖到死锁。

## 结论与重开条件

- **不照搬 ot 状态机**:CE 没有它要保护的交叉链路;引入一个无对应消费者的锁只会增加状态机复杂度。
- 若 CE 后续出现可复现的「更新时无法退出」路径(例如未来引入 before-quit 主动安装、或 electron-updater 行为变化),按 CLOSED-DIFF §2 F3 的形态重开该项:显式锁 + 安装失败于关机后 relaunch+exit(0) 自恢复。
- 相关但分离的决策:X3(153)会引入 recheckAfterDownload 与(成对评估的)autoInstallOnAppQuit=false + before-quit 安装;**若该对变更落地,需重新评估 A1**(因为那正是上游 3.15.1 存在、3.15.3 补锁的链路形态)。A1 与 X3 的成对评估在 153 的实施中联动。

## 证据

- CE autoUpdater.ts:405-485(quitAndInstallUpdate 全路径)、1593(autoInstallOnAppQuit)、index.ts:902(prepareAppQuit)、index.ts:2122(before-quit handler)、appShutdownPolicy.ts(selectAppShutdownPolicy join 语义)。
- 上游(共享只读 worktree)autoUpdater.ts 的 before-quit 处理器与 ensureAutoUpdatePollInterval(3.15.1 已存在);3.15.3 闭源 main/index.js 的 ot 锁(CLOSED-DIFF §2 F3 转储)。
