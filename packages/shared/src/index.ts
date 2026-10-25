// Modified by ZCode: 自上游 zai-org/ZCode aac47556 (Apache-2.0) 增量并入(F9/F10/F5):platform/channels 新类型与通道的导出 splice 点。
// CE-SYNC: 上游 cloudContent.ts / networkCapture.ts 為雲端行銷與抓包件、CE 不帶，對應 export 整段刪除。
export type {
  FileBinaryPreview,
  FileEntry,
  FileMediaPreview,
  FileStat,
  FileTextSlice,
  FileWatchEvent,
  WorkspaceFileEntry,
  SystemInfo,
  AppSettings,
  ElectronReleaseChannel,
  IntegratedTerminalShellDialect,
  IntegratedTerminalShellOption,
  IntegratedTerminalShellSelection,
  Locale,
  LocalePreference,
  ZCodeInteractionBehavior,
  TabId,
  TabState,
  ResourceUsageCategory,
  ResourceUsageBaseGroupKey,
  ResourceUsageProcess,
  HostResourceUsageProcess,
  ResourceUsageSnapshot,
  RemoteTargetSnapshot,
  RemoteWorkspaceSessionEntry,
  PersistedWorkspaceSessionEntry,
} from "./protocol.js";
export type { WorkspacePurpose } from "./workspacePurpose.js";
export { DEFAULT_LOCALE } from "./protocol.js";
export { ZCODE_VERSION, ZCODE_COMMIT, ZCODE_BUILD_TIME } from "./version.js";
export type { HelloMessage, HelloAckMessage } from "./handshake.js";
export type { ZCodeEnv, ZCodeProductFlavor } from "./env.js";
export type { RemoteAssetInstallMode } from "./remoteAssetInstallMode.js";
export type {
  RemoteResourcePackageId,
  RemoteResourcePackageSelection,
} from "./remoteResourcePackages.js";
export type {
  DockerConnectOptions,
  RemoteTarget,
  ServerConnectOptions,
  SSHConnectOptions,
  WSLConnectOptions,
} from "./remoteTarget.js";
export { stripRemoteTargetSecrets } from "./remoteTarget.js";
export { buildSshRemoteHostKey } from "./remoteSshHostKey.js";
export { buildRemoteEnvironmentKey } from "./remoteEnvironmentKey.js";
export type {
  ShortcutChannel,
  ShortcutCommandEntry,
  ShortcutCommandId,
  ParsedShortcutBinding,
} from "./shortcutCommands.js";
export {
  SHORTCUT_COMMANDS,
  getDefaultShortcutBindings,
  isValidShortcutBinding,
  normalizeShortcutKey,
  parseShortcutBinding,
  serializeShortcutBinding,
} from "./shortcutCommands.js";
export {
  ZCODE_ENV,
  ZCODE_PRODUCT_FLAVOR,
  ZCODE_APP_VERSION_ENV,
  ZCODE_BUILD_COMMIT_ID_ENV,
  RUNTIME_ZCODE_DEBUG,
  normalizeZCodeEnv,
  normalizeZCodeProductFlavor,
} from "./env.js";
export * from "./errors.js";
export * from "./validation.js";
export * from "./api.js";
export * from "./zcode-protocol/index.js";
export * from "./account-provider-state.js";
// re-home：旧协议承重面的幸存文件（消费者继续走 barrel，零感知）
export * from "./zcode-protocol-legacy-types.js";
export * from "./zcode-task-types-core.js";
export * from "./task-realtime-core.js";
export * from "./remote-workspace-identity.js";
export * from "./zcode-api-retry-status.js";
export * from "./zcode-network-debug-status.js";
export * from "./zcode-session-visible-content.js";
export * from "./official-mcp-auth.js";
export * from "./official-mcp-tool-error.js";
export * from "./conversation-message-projection-policy.js";
export * from "./conversation-share.js";
export * from "./conversation-share-content.js";
export * from "./conversation-preview-artifacts.js";
export * from "./zcode-session-task-status.js";
// CE-SYNC: 上游 zcode-session-content-profile.ts（index 摘要裁剪）CE 不帶，出口刪除。
export * from "./zcode-tool-projection-memory.js";
export * from "./zcode-slash-command-help.js";
export * from "./zcodeEndpoint.js";
export * from "./zcode-source-headers.js";
export * from "./zcode-agent-policy.js";
export * from "./zcode-media-policy.js";
export * from "./media-preview.js";
export * from "./plugin-display-name.js";
export * from "./zcode-agent-runtime.js";
export * from "./runtimeEnv.js";
export * from "./dynamic-workflow-feature.js";
export * from "./markdown-artifact-images.js";
export * from "./serviceAuthority.js";
export * from "./server-remote.js";
export * from "./source-server/index.js";

export interface ICredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export * from "./test-ids-workflow.js";
export * from "./channels.js";
export * from "./storage.js";
export * from "./oauth.js";
export * from "./desktopMenu.js";
export * from "./feedback.js";
export * from "./e2e-test-bridge.js";
export * from "./remoteAppConfig.js";
export * from "./helpAppConfig.js";
export * from "./remoteAssetInstallMode.js";
export * from "./onboardingRecord.js";
export * from "./remoteResourcePackages.js";
export * from "./plan-identity.js";
export {
  BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS,
  BROWSER_VIEW_RESTORE_BOOTSTRAP_URL,
  LOCAL_MEDIA_PREVIEW_SCHEME,
  DesktopCommandIds,
  buildLocalMediaPreviewUrl,
  createOpenInEditorRemoteTarget,
} from "./platform.js";
// 遥测已全部移除（P1）：以下模块与其全部导出已删除 ——
//   telemetry.ts（埋点载荷/脱敏上下文）、telemetryRedaction.ts（上报文本脱敏）、
//   remoteUsageTelemetry.ts（远端用量事件构造）、sessionCreateTelemetry.ts（会话创建事件 schema）、
//   rendererActionTrace.ts（renderer 行为 trace 协议）。
// 注意：RemoteWorkspaceConnectTrigger 是 connectRemote 的业务协议字段，已迁至 platform.ts 保留。
export type { LaunchMarks } from "./launchMarks.js";
export { LAUNCH_MARKS_QUERY_KEY, parseLaunchMarks, serializeLaunchMarks } from "./launchMarks.js";
export type {
  BrowserViewSurfaceScaleMode,
  CancelPendingRemoteConnectionRequest,
  BindRemoteWorkspaceSessionContextRequest,
  BindRemoteWorkspaceSessionContextIpcResult,
  BindRemoteWorkspaceSessionContextResult,
  BrowserTabResidencyState,
  BrowserViewCloseTabNotification,
  BrowserViewCloseTabRequest,
  BrowserViewOperationPayload,
  BrowserViewResidencyReportPayload,
  BrowserViewResidencyTransitionPayload,
  BrowserViewRestoredTabShell,
  BrowserViewRestoreTabsRequest,
  BrowserViewScreenshotSurfacePreparePayload,
  BrowserViewScreenshotSurfaceReadyPayload,
  BrowserViewScreenshotSurfaceReleasePayload,
  BrowserViewViewportChangedPayload,
  ChromeBrowserDataImportError,
  ChromeBrowserDataImportOptions,
  ChromeBrowserDataImportResult,
  ConnectRemoteRequest,
  RemoteWorkspaceConnectTrigger,
  CreateTempTextAttachmentRequest,
  CreateTempTextAttachmentResult,
  MaterializeWorkflowArtifactFileRequest,
  MaterializeWorkflowArtifactFileResult,
  SaveFileRequest,
  SaveFileResult,
  PrintPageToPdfResult,
  DesktopCloseToTrayCapability,
  DesktopCommandId,
  CuaOsSupport,
  DesktopWindowChromeState,
  DesktopTitleBarTheme,
  DockerContainerInfo,
  EditorInfo,
  ApplicationIconInfo,
  ApplicationIconLocator,
  ApplicationIconRequest,
  BrowserGuestAttachRejectReason,
  BrowserGuestAttachResult,
  EmbeddedBrowserDataClearResult,
  EmbeddedBrowserOpenUrlRequest,
  EmbeddedBrowserPermissionDeviceOption,
  EmbeddedBrowserPermissionPromptEvent,
  EmbeddedBrowserPermissionResolution,
  EmbeddedBrowserPermissionResolveRequest,
  EmbeddedBrowserPermissionScreenOption,
  EmbeddedBrowserSitePermissionResetRequest,
  EmbeddedBrowserSitePermissionUpdateRequest,
  EmbeddedBrowserSitePermissionsSnapshot,
  IPlatformService,
  OpenInEditorRemoteTarget,
  OpenInEditorOptions,
  PostUpdateReleaseNotesPayload,
  RemoteConnectionRuntimeLog,
  RemoteSessionClosedEvent,
  RemoteSessionReconnectedEvent,
  RemoteServiceSession,
  SSHConfigAliasOption,
  TaskNotificationPayload,
  UpdateCheckResultPayload,
  UpdateStatePayload,
  WSLDistro,
  WindowControlsOverlayReadyPayload,
  ZCodeStdioTapDevState,
} from "./platform.js";
export type {
  CuaAccessibilitySettingsResult,
  CuaPermissionKind,
  OpenCuaPermissionOnboardingOptions,
  PrepareCuaHelperPermissionDragResult,
} from "./cuaAccessibilitySettings.js";
export type { ZCodeTaskCreateResult } from "./zcode-task-types.js";
export * from "./zcode-task-types.js";
export * from "./automation-types.js";
export * from "./off-peak-types.js";
export * from "./background-task-control-merge.js";
export * from "./background-task-controls.js";
export * from "./background-task-notifications.js";
export * from "./background-bash-jobs.js";
export * from "./zcode-agent-model-state.js";
export * from "./task-realtime.js";
export { formatTimestamp, formatLogPrefix } from "./log-format.js";
export * from "./model-provider-types.js";
export * from "./model-provider-family.js";
export * from "./provider-family-connection-selection.js";
export * from "./provider-provisioning.js";
export * from "./custom-model-value.js";
export * from "./model-selection-types.js";
export * from "./model-selection-key.js";
export * from "./model-selection.js";
export * from "./legacy-model-provider-identity.js";
export * from "./official-glm-model-id.js";
export * from "./skills-types.js";
export * from "./skill-sync.js";
export * from "./mcp-sync.js";
export * from "./plugin-sync.js";
export * from "./remote-sync.js";
export * from "./plugin-types.js";
export * from "./subagents-types.js";
export * from "./settings-source.js";
export * from "./settings-errors.js";
export * from "./app-runtime-preferences.js";
export * from "./command-types.js";
export * from "./plugin-marketplaces.js";
export * from "./lineChangeStat.js";
export * from "./process-names.js";
export * from "./mcp.js";
export * from "./runtime-tool-runtime.js";
export * from "./git.js";
export * from "./bots.js";
export * from "./assistant-message-parts.js";
export * from "./zcodePersistedMessageMerge.js";
export * from "./assistant-presentation.js";
export * from "./tool-call-summary.js";
export * from "./tool-identity.js";
export * from "./streaming-tool-input-preview.js";
export * from "./tool-plan-adapter.js";
export * from "./permission-request-preview.js";
// CE-SYNC: 上游 web-remote-control.ts / web-remote-control-rpc-transport.ts（雲中繼遠端控制
// 協議與 RPC 傳輸）CE 不帶——CE 的遠控是自託管 web-service（?token），出口刪除；
// 保留的是 CE 自有的 #src/web-remote-relay（純中繼契約/重試/心跳計時）。
export * from "#src/web-remote-relay/index.js";

export * from "./settings-sync.js";
export * from "./uuid.js";
export * from "./usage-stats.js";
export * from "./coding-plan-subscription.js";
export * from "./forceUpdate.js";
export * from "./intranetProbe.js";
export * from "./intranetDefaults.js";
export * from "./hooks.js";
// CE-SYNC: 上游 memory.ts（Memory/MemoryConfig，AGENTS.md 式 agent memory 載入）與
// output-style.ts（OutputStyle/OutputStyleConfig/OutputStyleGenerationStatus）CE 不帶，
// 出口刪除；CE 保留的 Project Memory 介面在 packages/services/src/memory/，
// 且 memoryDiagnostics.ts（CE 有）仍照常出口。
export * from "./openrouter-attribution.js";
export * from "./workspaceSessionRestore.js";
export * from "./skill-scan-policy.js";
export * from "./browser-use/index.js";

export * from "./coding-plan-reset.js";
export * from "./highspeed.js";
export {
  parseSubagentMarkdownSelection,
  formatSubagentMarkdownModel,
} from "./subagent-markdown-selection.js";
export * from "./memoryDiagnostics.js";
export * from "./database-startup.js";
export * from "./processResourceTelemetry.js";
export * from "./execution-state.js";

export { bashOutputDisplaySchema } from "./bash-output-display.js";

export * from "./subagent-runtime-config.js";

export * from "./subagent-profile.js";
// CE-SYNC: 上游 subagent-profile-parser.ts（parseAgentProfileFromMarkdown）CE 不帶，
// 同名實作在本倉走 @zcode/core（apps/zcode-cli/packages/core/src/subagent/profile.ts）。

export * from "./localTtft.js";
export * from "./pluginStoreOrder.js";
export * from "./clientConfig.js";
export * from "./pluginStoreOrdering.js";
// CE-SYNC: 上游 marketingTouch.ts / rewardsEmbedded.ts / rewardsBridge.ts（行銷觸達與獎勵
// 錢包橋接）為雲端商業件、CE 不帶，出口刪除。
export * from "./session-debug.js";
// CE-SYNC: ./highspeed.js 在兩側各出口一次（上游位置在 coding-plan-reset 之後，已在上方保留），
// 此處去重。
export * from "./attachment-source.js";
export * from "./channel-mention.js";

export {
  requestSecuritySensitiveHeaders,
  isRequestSecurityFailure,
} from "./request-security-edition/policy.js";
export * from "./request-security-edition/verification-policy.js";
export * from "./conversationSelection.js";
export { redactFeedbackText } from "./feedbackPrivacy.js";
// CE-SYNC: 上游 api-key-usage-scene.ts / project-access-token.ts / project-access-token-client.ts
// （雲端專案存取 token 與用量場景標記）CE 不帶，出口刪除；相關消費端由主代理統一收斂。
// 以下模組的出口在上面段落已出現一次（CE 側位置），重複的一份予以去重：
// subagent-runtime-config / subagent-profile / attachment-source / channel-mention /
// conversationSelection / request-security-edition/{policy,verification-policy}。

export * from "./conversation-share-tool-presentation.js";

// ---- CE 重植（3.16.1 整版合并）：index 取上游版时被冲掉的 CE 模块出口 ----
// 原则：CE 專屬模块補回根出口；與上游已有模块重名的符號用顯式名單（顯式出口優先於
// export *，可消 TS2308 歧義），platform 不能整模块 export *（CE 只出口自托管遠控與
// 桌面縮放需要的名單符號，其餘符號與上游同名會造成歧義）。
// CE-SYNC-TODO: qimen-pan.ts / liuren-pan.ts（奇門／六壬圍欄契約）只在 ce-pr5 分支存在，
// 本輪 9472d465 剪除提交把它們連同 renderer 元件與 spec 一起移除（CE main 7fc3bfe2 無此二檔），
// 但規則檔把「qimen/liuren 圍欄」列為 CE 差異化功能、且 packages/ui i18n 仍殘留相關字串。
// 為免 TS2307 暫先刪除這兩行出口；若要還原該功能，需一併從 ce-pr5 取回 shared 契約 +
// packages/ui 的 QimenPanBlock/LiurenPanBlock + spec 檔，由主代理決定。
// export * from "./qimen-pan.js";
// export * from "./liuren-pan.js";
export * from "./dangerousCommands.js";
export * from "./test-ids.js";
export * from "./githubMirror.js";
export * from "./model-catalog.js";
export * from "./workspace-registry.js";
// remoteAssetCdn 是 CE 的 CDN 覆写模块（RemoteAssetsSetting/desktopRuntimeEnv 消费）。
export * from "./remoteAssetCdn.js";
// manual-claim：上游 3.16.1 在 coding-plan-subscription 里原生化了同名类型（无 endsAt/
// ClaimOutcome/parseManualClaimPlanPreviews 等扩展），CE 扩展按显式名单出口压过 star 歧义。
export type { ManualClaimPlanPreview } from "./manual-claim-plan.js";
export {
  MANUAL_CLAIM_CAPTCHA_CONFIG_UNAVAILABLE,
  MANUAL_CLAIM_CAPTCHA_DISABLED,
  MANUAL_CLAIM_CAPTCHA_SOLVER_UNAVAILABLE,
  MANUAL_CLAIM_FAILURE_MESSAGE_KEYS,
  classifyManualClaimCode,
  parseManualClaimPlanPreviews,
  pickManualClaimPlan,
} from "./manual-claim-plan.js";
export type {
  ManualClaimCaptchaConfig,
  ManualClaimCaptchaSolution,
  ManualClaimPlanClaimOutcome,
} from "./manual-claim-plan.js";
// platform：CE 自托管 Web 服务/远程控制面 + 桌面缩放，按名单出口。
export type {
  DesktopZoomState,
  RemoteControlConnection,
  RemoteControlConnectionRole,
  RemoteControlConnectionsPayload,
  RemoteControlRevokeRequest,
  RemoteControlRevokeResult,
  RemoteControlRotateTokenResult,
  WebServiceConnectionInfoPayload,
  WebServiceStatusErrorCode,
  WebServiceStatusPayload,
  WebServiceStatusStaleReason,
  WebServiceStatusState,
  WindowControlsOverlayMetrics,
} from "./platform.js";
