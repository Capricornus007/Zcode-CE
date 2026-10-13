# 165 · F9 内置浏览器权限确认 UI(X4 默认放行隐患的 UI 侧)

> 状态：**UI staging 已搬入(7 文件:browser-use 5 + store + hook), 唯一缺口 shared/test-ids.ts 的 5 个 TID_BROWSER_PERMISSION 常量(task-14 已派 desktop-host);集成入口等 desktop-host 的 F9 UI bridge**。覆盖公告「内置浏览器网站权限管理」的 UI 侧。

## 0. 读了什么 / 结论一致性

| 材料              | 结论                                                                                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX F9 行 | **证实 0**。上游 UI 独有:`browser-use/{browserPermissionCapabilities,BrowserPermissionIcon,BrowserSitePermissionsPage,BrowserSiteSettingsEntry,EmbeddedBrowserPermissionPrompts}.`(5)+`store/embeddedBrowserPermissionStore.ts`。CE `browser-use/` 有 15 文件,均为视口/截图/缩放类,**无权限治理**。 |
| 上游 spec         | `docs/browser-use/2026-10-08-embedded-browser-permission-governance-spec.md`(上游)—— UI 侧实现依据。                                                                                                                                                                                                |
| CE spec 135 风格  | UI 访问服务/平台一律经 hooks 与 `IPlatformService`,不直接 `window.zcode`。                                                                                                                                                                                                                          |

## 1. 产品规则

1. **权限确认是默认否**:摄像头/麦克风/地理位置等敏感权限默认不放行(X4 修复口径);用户逐站点授权。
2. **UI 三处落点**:站点权限页面(全局查看/回收)、站点设置入口(地址栏旁)、嵌入浏览器内的权限提示条(`EmbeddedBrowserPermissionPrompts`,382 行,含来源图标与选择打开方式)。
3. **权限状态唯一所有者在 Main 侧**(`SitePermissionStore`,desktop-host-port 范围);UI 只做投影与发起请求,不本地缓存决策。
4. **禁止静默放行**:任何默认值变化要在 UI 上可见(提示条必须出现,不得默认跳过)。

## 2. 状态所有者

| 状态           | 唯一所有者                         | 读取方                             |
| -------------- | ---------------------------------- | ---------------------------------- |
| 站点权限事实   | desktop Main `SitePermissionStore` | BrowserSitePermissionsPage、提示条 |
| 提示条交互结果 | UI →经 IPC→ Main                   | 权限存储                           |

## 3. 接口

- Main 侧(desktop-host-port):`PermissionUiBridge`、`desktopBrowserDataIpc`(不在本成员范围;UI 侧消费其 channel)。
- UI 侧:`hooks/useBrowserSitePermissions.ts`、`store/embeddedBrowserPermissionStore.ts`(会话级 UI 状态)。

## 4. 验收

- 打开需要摄像头权限的站点 → 提示条出现且默认不放行;授权后站点权限页可查看并回收。
- 资源管理器/地址栏入口可达站点设置页。

## 5. 搬运清单

`browser-use/` 5 文件 + `store/embeddedBrowserPermissionStore.ts` + `hooks/useBrowserSitePermissions.ts`(Apache-2.0)。
