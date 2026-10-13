# ZCode-CE

## 与官方 3.15.1 的关系（本版基线）

本版从上游 `zai-org/ZCode` `v3.15.1`（`aac47556`，Apache-2.0，官方公告 2026-10-12：11 项新功能 + 12 项修复）移植。公告条目与本仓库的逐条对照（已跟进 / 部分跟进 / 未跟进（有意） / 不适用四档）见 `docs/development/upstream-sync.md` 的 v3.15.1 节。

- **已落地**：F2（HighSpeed 客户端面）、F3（危险命令确认）、F4（可视化交互界面）、F5（UI 插件 / MCP App，契约 + 桌面宿主 + 界面 + 服务桥）、F6/F7（工作流运行中改并发、保存复跑链、子代理单独指定模型）、F8（飞书群 + 独立话题：服务波次与 UI 接线）、F9（内置浏览器权限治理）、F10（Linux 托盘驻留）、F11（账户菜单套餐与复制用户 ID）、X1/X2/X3/X4/X5/X6/X8/X9/X11/X12，以及上游 3.15.3 闭源修复中的 OAuth 损坏会话清理容错（A2）。
- **部分跟进（延期到下一轮）**：F6 的渲染层判别（station-observation 取舍）与创建前调参界面。
- **有意不搬**：F1「邀请好友·免费蹬蹬」是官方服务端运营活动（开源仓库零载荷）；F2 的服务端部分（抽卡权重与发卡逻辑）；上游 3.15.3 闭源的更新退出状态机与签名器守卫（经评估 CE 无对应链路与组件，依据见 upstream-sync v3.15.1 节）。

## 新增功能

- **自主模式执行危险命令前会先征求确认**：危险命令（如删除、覆盖关键文件、提权操作）在执行前弹出确认，说明将要执行什么、为什么被判为危险；可在设置里调整确认粒度。此能力与既有的危险命令清单策略并存，不改变已有交互。
- **消息流里可以直接展示可视化界面**：助手输出的 `::visualize` 引用现在会投影成有边界的桌面沙箱页面（gen-ui），而不是只剩一个文件链接；重复的 HTML 预览卡会自动去重。这些页面与 MCP 应用页面共用同一套准入与回收机制。
- **支持 UI 插件（MCP App）**：MCP 应用可以带界面——插件在独立沙箱里运行页面、与宿主按声明申请权限（摄像头/麦克风/地理位置需确认、剪贴板写入按声明放行、macOS 走系统授权），工具调用与资源订阅按 lease 引用；插件市场声明与实际分发的口径在本版一并核对。不声明权限的调用一律拒绝。
- **内置浏览器现在有网站权限管理**：内置浏览器（用于网页类任务）对摄像头、麦克风、剪贴板读取、地理位置、通知、MIDI、设备与屏幕共享等敏感能力**默认不自动放行**——每项都要你点头（访问此网站时允许 / 仅本次允许 / 不允许，20 秒超时按拒绝结算），设备类弹出选择器选具体设备。同意记录按站点持久化，可在设置页「网站权限」查看与清除，清除浏览器数据时一并联动。未知的新权限枚举一律拒绝，不会随 Electron 升级悄悄放权。
- **Linux 下关闭窗口可驻留系统托盘**：Linux 对齐 Windows 的托盘驻留（设置开 + 托盘可用时关窗隐藏驻留）。托盘是否可用先检测系统的 StatusNotifier 支持，不可用时设置项置灰并回到既有的确认退出路径，不会失联；GNOME 类未装 AppIndicator 的环境会提示安装扩展。托盘右键菜单的「清空全部数据」改为「导出日志」（不再从右键菜单暴露清空操作）。
- **账户菜单可查看套餐并复制用户 ID**：左下角账户菜单头部显示当前套餐与用户 ID，排查或报障时一键复制用户 ID（失败有明确提示）。
- **工作流支持运行中改并发、保存复跑，子代理可单独指定模型**：运行中的工作流可以在确认窗里调整并发上限与单个子代理使用的模型（向下取整、回到默认与会话模型三态语义），保存后的工作流可直接复跑；工作流记录里也会如实呈现每个子代理实际使用的模型。创建前的参数配置界面与部分工作流渲染的判别仍在跟进（见维护者台账）。
- **GLM HighSpeed 加速卡界面（客户端面）**：命中加速时本轮消息出现紫色流光卡片与激活动效，带到期时钟与剩余时长（节省时长标签）；卡片可分享。加速上下文在切走再切回时从「恢复」态继续，不重播扩散动画；卡过期后不再把普通输出染成加速样式。发卡与抽奖逻辑属官方服务端，本版只包含客户端展示与交互。

## 体验优化

- **更新下载失败后自动复查**：下载失败或下载完成（发现已下载版本被更高版本取代）时自动发起新一轮检查，而不是停在原地等手动点；检查进行中的复查会收口后补一次，不会丢。轮询节奏改为无目标 15 分钟、有可见更新目标 2 分钟；已发现的更新目标不会被中间态闪掉或清掉。
- **内置浏览器打开本地文件不再失败**：`file:` 链接改用系统默认应用打开（复用既有的路径打开实现），而不是对 file 协议无效果的 `shell.openExternal`。
- **多个工作区同时启动时更省内存**：启动预热从「最近使用的 3 个工作区」收敛为「当前工作区 1 个」——会话进程没有闲置回收，常驻 3 份进程内存不划算；切到最近项目的冷启动收益通过按需加载获得。
- **登录身份验证失败时的恢复更稳**：清理损坏的 OAuth 会话后刷新派生登录方式失败时，不再让整个清理流程报错（此前会出现设置页「连接套餐失败、需要重新登录」）；失败信息收敛到独立日志域，便于定位。

## 问题修复

- **加速回合中编辑的消息不再丢失**：此前在加速回合进行中编辑并重发消息，完成通知会被「分支过期」逻辑丢弃，界面永远转圈、取消也报「任务不在运行」。现在编辑重发只认本次重新准备的加速凭据，且在新旧消息的递送竞态里按原子排队处理，旧消息被截断时新消息不会随之丢失。
- **工作流恢复或修改后任务状态显示正确**：任务卡片里执行者与会话身份的对应关系在恢复、改并发、换模型后保持一致（跟随上游的会话身份语义一并修正）。
- **群聊里的 @提及识别更准**：提及与反向回复改用严格的公共解析（三端共用同一份模式），Host 来源可核对，不再按松散文本匹配。
- **额度已满时看得到重置机会入口**：重置机会（含完成的任务带回的余量）不再因「额度已满」被隐藏；完成提示带上剩余机会数。
- **窗口大小变化时对话不再跳动**：视口尺寸变化时测高与吸底在同一批次内同步提交，不再「先按旧高度吸底、下一帧测高后再跳一次」。
- **Windows 链接启动应用更安全**：注册为默认协议处理者时，在 URL 位置前插入参数终止符，链接里的特殊字符不会再被拆成 Electron 启动开关（此前可注入调试、GPU 等开关）。

## 本版尚未验证

- **JetBrains/Windows deep-link 加固未在真机验证**：注册表命令行的核对在 Linux 开发环境下无法执行。
- **内置浏览器的权限弹窗与插件沙箱未在真实 Electron 窗口里逐屏看过**：门控行为有单测覆盖，渲染态与真实 webview attach 未做端到端验证（需要 dev:desktop 联调一轮）。
- **工作流并发上限的两条界（ceiling 与 limit）语义重构后，与既有钳制行为并存**：两路并存的行为差异由本版回归测试覆盖，长期使用反馈待观察。
- **GLM HighSpeed 卡片依赖官方服务端下发**：客户端展示与交互已实现，但命中加速的实际下发、到期与节省时长标签的数值未做线上验证。

---

# English

## Relationship to official 3.15.1 (this release's baseline)

This release ports from upstream `zai-org/ZCode` `v3.15.1` (`aac47556`, Apache-2.0; official announcement 2026-10-12: 11 features + 12 fixes). The entry-by-entry ledger (synced / partially synced / intentionally not synced / not applicable) is in the v3.15.1 section of `docs/development/upstream-sync.md`.

- **Landed**: F2 (HighSpeed client side), F3 (dangerous-command confirmation), F4 (visualization surface), F5 (UI plugins / MCP App — contract, desktop host, UI surface and service bridge), F6/F7 (in-run concurrency adjustment, save-and-rerun chain, per-subagent model), F8 (Feishu groups + standalone topics: service wave and UI wiring), F9 (embedded-browser permission governance), F10 (Linux close-to-tray), F11 (account menu plan + copy user ID), X1/X2/X3/X4/X5/X6/X8/X9/X11/X12, plus the corrupt-OAuth-session cleanup tolerance from upstream's closed-source 3.15.3 (A2).
- **Partially synced (deferred to the next round)**: the F6 render-layer discrimination (station-observation trade-off) and the pre-create settings UI.
- **Intentionally not ported**: F1 "invite friends" is an official server-side campaign (zero payload in the open-source repository); the server-side parts of F2 (lottery weights and issuance); upstream 3.15.3's closed-source update-exit state machine and signer guards (CE has no corresponding link or component — rationale in the upstream-sync v3.15.1 section).

## New features

- **Dangerous commands now ask before executing in autonomous mode**: dangerous operations (deletions, overwriting key files, privileged actions) prompt a confirmation explaining what will run and why it was classified as dangerous; confirmation granularity is configurable. This coexists with the existing dangerous-command policy without changing current interactions.
- **The message stream can render visualization surfaces directly**: `::visualize` references in assistant output now project into a bounded desktop sandbox page (gen-ui) instead of leaving only a file link; duplicate HTML preview cards are deduplicated. These pages share the same admission and eviction mechanism as MCP application pages.
- **UI plugins (MCP App) are supported**: MCP applications can ship a UI — plugin pages run in an isolated sandbox, request permissions by declaration (camera/microphone/geolocation require confirmation, clipboard-write allowed by declaration, macOS goes through system authorization), and tool calls / resource subscriptions are lease-referenced; the plugin manifest-vs-actually-distributed surface was reconciled in this release. Undeclared permission requests are denied.
- **The embedded browser now has site permission management**: sensitive capabilities — camera, microphone, clipboard read, geolocation, notifications, MIDI, devices, screen sharing — are **no longer auto-approved**: each requires your decision (allow on this site / allow once / deny; 20 s timeout counts as deny), with device pickers for device-type permissions. Consent is persisted per site, viewable and clearable in Settings → "Site permissions", and cleared together with browser data. Unknown permission enums are denied outright, so new Electron permissions cannot silently grant access.
- **Closing the window on Linux can now keep the app in the system tray**: Linux reaches parity with Windows' close-to-tray (when enabled and a tray is available, closing hides to tray). Tray availability is detected via StatusNotifier support; when unavailable the setting is disabled and the existing confirm-quit path is used (you never lose control). GNOME-style desktops without AppIndicator get an install hint. The tray context menu's "clear all data" became "export logs" (no longer exposing destructive cleanup from the tray).
- **The account menu shows your plan and copies your user ID**: the account menu footer shows the current plan badge and user ID; a one-click copy for support tickets (failures are reported clearly).
- **Workflows support in-run concurrency adjustment, save-and-rerun, and per-subagent models**: the confirmation pane adjusts a running workflow's concurrency cap and the model used by individual subagents (floor / back to default / session model, three-state semantics); saved workflows can be rerun directly; the per-run record honestly shows which model each subagent actually used. The pre-create settings UI and the discrimination of some workflow rendering are still being followed up (see the maintainer ledger).
- **GLM HighSpeed card UI (client side)**: an accelerated turn shows a purple animated card with activation effect, expiry clock and remaining time saved; the card is shareable. Acceleration context resumes (not replays) when switching away and back; once a card expires, ordinary output is no longer styled as accelerated. Issuance and the lottery are official server-side; this release contains only the client presentation and interaction.

## Improvements

- **Update checks resume automatically after a download failure**: a failed download — or a completed download superseded by a newer version — triggers a fresh check instead of waiting for a manual click; rechecks queued during an in-flight check run once it settles. Polling cadence is now 15 min with no target and 2 min with a visible update target; a discovered update target is no longer flickered away or cleared by intermediate states.
- **Opening local files from the embedded browser works again**: `file:` links are handed to the system default app (reusing the existing path-opener) instead of `shell.openExternal`, which is a no-op for the file scheme on many platforms.
- **Startup uses less memory with multiple workspaces**: warm-up narrowed from the 3 most-recent workspaces to just the active one — CLI sessions have no idle reaping, so 3 resident processes per window did not pay off; recent-project cold starts are covered by on-demand loading.
- **Login recovery is more robust**: when refreshing derived providers after a corrupt OAuth session cleanup fails, the cleanup itself no longer errors out (previously the settings page showed "connection plan failed, please log in again"); failures are captured in a dedicated log domain for diagnosis.

## Fixes

- **Edited messages no longer get lost during accelerated turns**: previously, editing and resending a message while an accelerated turn was running had its completion notification dropped by the branch-expiry logic, leaving the UI spinning and cancel reporting "task not running". The edit-resend now only accepts the freshly prepared acceleration credential, and the delivery race between old and new messages is queued atomically, so a truncated old message no longer takes the new one with it.
- **Task status is correct after workflow restore or modification**: the executor-to-session mapping stays consistent across restore, concurrency changes and model switches (fixed together with the upstream session-identity semantics).
- **@mentions in group chats are recognized correctly**: mentions and reply notifications use a strict shared parser (one schema across all three ends) with verifiable host provenance, instead of loose text matching.
- **Quota-reset opportunities are visible when quota is exhausted**: remaining opportunities (including those brought back by completed runs) are no longer hidden behind the "quota full" state; completion notices carry the remaining count.
- **The conversation no longer jumps when the window is resized**: height measurement and stick-to-bottom now commit in the same synchronous batch, instead of "sticking with stale heights first and jumping again after the next frame's measurement".
- **Launching the app from a link on Windows is safer**: when registering as the default protocol handler, an argument terminator is inserted before the URL position, so special characters in links can no longer be split into Electron launch switches (which previously allowed injecting debug/GPU flags).

## Not yet verified in this version

- **The Windows deep-link hardening was not verified on a real Windows machine**: registry command-line inspection cannot run from a Linux dev environment.
- **The embedded-browser permission prompts and the plugin sandbox have not been seen in a real Electron window**: gating behavior is unit-tested; rendered state and real webview attach were not verified end to end (needs a dev:desktop pass).
- **After the workflow concurrency two-bounds (ceiling vs limit) rework, the new semantics coexist with the existing clamp behavior**: the differences are covered by this release's regression tests; long-term behavior under real use remains to be seen.
- **The GLM HighSpeed cards depend on official server-side issuance**: the client presentation and interaction are implemented, but actual accelerated delivery, expiry and the remaining-time labels were not verified against the live service.
