import {
  ServiceCollection,
  IFileService,
  IGenUiService,
  IMediaPreviewService,
  IGitService,
  IGitCheckpointService,
  ISystemService,
  ITerminalService,
  ISettingService,
  IOnboardingRecordService,
  ICredentialService,
  IBroadcastService,
  IZCodeTaskService,
  IZCodeAgentService,
  IZCodeSessionService,
  IConversationShareService,
  createUnsupportedConversationShareService,
  IBotsService,
  IFileWatcherService,
  IOAuthService,
  IModelSelectionService,
  IProviderSettingsService,
  ISourceServerWorkspaceService,
  IUsageStatsService,
  ICodingPlanSubscriptionService,
  IClientConfigService,
  IClientScenesService,
  ISkillsService,
  ISkillSyncService,
  IMcpSyncService,
  IPluginSyncService,
  IPluginsService,
  IPluginManagementService,
  ISubagentsService,
  ICommandsService,
  IHooksService,
  IMemoryService,
  IOutputStyleService,
  ISettingsSyncService,
  IProjectService,
  ITaskGroupService,
  IRemoteProjectService,
  IPromptAttachmentTransferService,
  type ServiceDescriptor,
  type IServiceAccessor,
} from "@zcode/services";
import {
  REMOTE_WORKSPACE_RPC_CHANNELS,
  assertRemoteWorkspaceRpcContract,
} from "./remoteWorkspaceRpcContract.js";
import {
  createServiceLogger,
  createLegacySingleRootProjectService,
  createRemoteProjectService,
} from "@zcode/services/node";
import {
  buildServerRemoteWorkspaceIdentity,
  remoteHostIdFromWorkspaceIdentity,
} from "@zcode/shared";
import type { RemoteTarget } from "@zcode/shared";
import {
  createRemoteProviderProvisioningExecutorFromWorkspace,
  registerRemoteProviderProvisioningExecutor,
} from "./remoteProviderProvisioningService.js";

export const REMOTE_WORKSPACE_RPC_REGISTRATIONS = [
  ["fileService", IFileService],
  ["genUiService", IGenUiService],
  ["mediaPreviewService", IMediaPreviewService],
  ["gitService", IGitService],
  ["gitCheckpointService", IGitCheckpointService],
  ["systemService", ISystemService],
  ["terminalService", ITerminalService],
  ["settingService", ISettingService],
  ["onboardingRecordService", IOnboardingRecordService],
  ["credentialService", ICredentialService],
  ["broadcastService", IBroadcastService],
  ["zcodeTaskService", IZCodeTaskService],
  ["zcodeAgentService", IZCodeAgentService],
  ["zcodeSessionService", IZCodeSessionService],
  ["conversationShareService", IConversationShareService],
  ["botsService", IBotsService],
  ["fileWatcherService", IFileWatcherService],
  ["oauthService", IOAuthService],
  ["providerSettingsService", IProviderSettingsService],
  ["modelSelectionService", IModelSelectionService],
  ["sourceServerWorkspaceService", ISourceServerWorkspaceService],
  ["usageStatsService", IUsageStatsService],
  ["codingPlanSubscriptionService", ICodingPlanSubscriptionService],
  ["clientScenesService", IClientScenesService],
  ["skillsService", ISkillsService],
  ["skillSyncService", ISkillSyncService],
  ["mcpSyncService", IMcpSyncService],
  ["pluginSyncService", IPluginSyncService],
  ["pluginsService", IPluginsService],
  ["pluginManagementService", IPluginManagementService],
  ["subagentsService", ISubagentsService],
  ["commandsService", ICommandsService],
  ["hooksService", IHooksService],
  ["memoryService", IMemoryService],
  ["outputStyleService", IOutputStyleService],
  ["settingsSyncService", ISettingsSyncService],
  ["promptAttachmentTransferService", IPromptAttachmentTransferService],
] as const satisfies readonly [keyof IServiceAccessor, ServiceDescriptor<unknown>][];

const conversationShareLog = createServiceLogger("conversation-share");

function createUnsupportedRemoteConversationShareService(): IConversationShareService {
  return createUnsupportedConversationShareService({
    message: "Conversation sharing is not available for this client or remote target",
    onRejected: (action) => {
      conversationShareLog.warn(undefined, "conversation share action rejected", {
        action,
        kind: "feature_disabled",
        reason: "server_remote_unsupported",
      });
    },
  });
}

export function resolveServerProjectService(params: {
  connectionServices: IServiceAccessor;
  serverId: string;
  virtualProjects?: boolean;
  sourceServices?: ServiceCollection;
}): IProjectService {
  if (params.virtualProjects) {
    if (!params.connectionServices.projectService)
      throw new Error("Remote virtual-project RPC registration incomplete");
    return params.connectionServices.projectService;
  }
  const hostId = remoteHostIdFromWorkspaceIdentity(
    buildServerRemoteWorkspaceIdentity({ serverId: params.serverId, workspacePath: "/" }),
  )!;
  return createLegacySingleRootProjectService({
    hostId,
    directories: {
      info: () => params.connectionServices.systemService.info(),
      read: (input) => params.connectionServices.fileService.readdir(input),
    },
    readSettings: () => params.connectionServices.settingService.get(),
    readKnownWorkspaces: async () => {
      const directory = await params.sourceServices
        ?.getOptional(IRemoteProjectService)
        ?.readDirectory();
      return (directory?.entries ?? [])
        .filter((entry) => entry.hostId === hostId)
        .flatMap((entry) =>
          entry.roots.length
            ? entry.roots.map((root) => ({ workspacePath: root.rootPath }))
            : entry.legacyWorkspace
              ? [
                  {
                    workspacePath: entry.legacyWorkspace.workspacePath,
                    workspacePurpose: entry.legacyWorkspace.workspacePurpose,
                  },
                ]
              : [],
        );
    },
    // desktop-attached remote 只复用本机已解析或旧存储中的 Key；远端刷新仍由本机正式账号链负责。
    resolveProviderApiKey: async () => null,
  });
  const readLocalAccountProviderSettings = async () => {
    const settings = await localSettingService.get();
    return {
      providerFamilyDomain: settings.providerFamilyDomain ?? null,
      selections: settings.providerFamilyConnectionSelections ?? {},
    };
  };
  const loadLocalAccountIdentity = async (family: ProviderFamilyDomain) => {
    const providerId = family === "zai" ? ZAI_PROVIDER_ID : BIGMODEL_PROVIDER_ID;
    return (await localOAuthCredentialRepo.loadUserProfile(providerId))?.id ?? null;
  };
  const localAccountRequestAuthService = createAccountRequestAuthService(
    createAccountProviderRequestAuthService({
      resolveCurrentAccountAccess: (access) =>
        resolveCurrentAccountAccess({
          access,
          readSettings: readLocalAccountProviderSettings,
          loadAccountIdentity: loadLocalAccountIdentity,
        }),
      loadOAuthTokenSet: (providerId) => localOAuthCredentialRepo.loadTokenSet(providerId),
      async loadIndividualPlanApiKey(providerId, family) {
        const oauthProviderId = family === "zai" ? ZAI_PROVIDER_ID : BIGMODEL_PROVIDER_ID;
        const accountIdentity = (await localOAuthCredentialRepo.loadUserProfile(oauthProviderId))
          ?.id;
        if (!accountIdentity) return null;
        return localAccountProviderCredentialService.loadCodingPlanApiKey({
          providerId,
          family,
          accountIdentity,
        });
      },
      resolveTeamPlanApiKey: (access) =>
        resolveAccountTeamPlanRuntimeApiKey({
          apiClient: localApiClient,
          credentialService: localCredentialService,
          access,
        }),
    }),
  );
  const localCodingPlanSubscriptionService = createCodingPlanSubscriptionService({
    apiClient: localApiClient,
    credentialService: localCredentialService,
  });
    readTasks: ({ workspacePath, kind }) => {
      const tasks = params.connectionServices.zcodeTaskService;
      const scope = { workspacePath };
      return kind === "pinned"
        ? tasks.listPinnedTasks(scope)
        : kind === "archived"
          ? tasks.listArchivedTasks(scope)
          : tasks.listTasks(scope);
    },
    ensureConversation: async () =>
      (await params.connectionServices.fileService.ensureConversationWorkspace()).path,
  handleOAuthProviderLogout = createOAuthProviderLogoutHandler({
    accountProviderCredentialStore: localAccountProviderCredentialStore,
  });
  const conversationShareClient = new ConversationShareHttpClient({
    // 远端 workspace 的分享也必须使用真实 API；本地 Mock 仅用于单测，不生成无法跨进程访问的链接。
    apiClient: localApiClient,
    baseUrl: buildRuntimeZCodeApiUrl(process.env, "/api/v1"),
    tokenProvider: async () =>
      (await localCredentialService.load(ZCODE_JWT_TOKEN_KEY))?.trim() || null,
  });
  const conversationShareService = new ConversationShareService({
    zcodeAgentService: params.connectionServices.zcodeAgentService,
    client: conversationShareClient,
    artifactSource: createRemoteConversationShareArtifactSource(
      params.connectionServices.fileService,
    ),
  });
  const reportingRemoteZCodeTaskService = params.createReportingRemoteZCodeTaskService(
    params.connectionServices.zcodeTaskService,
  );
  // 手机 remote 的 replayable mirror 在 reporting wrapper 中发布用户消息；
  // 附件物化必须包在 reporting 外层，确保 mirror 和真正发给远端 agent 的 prompt 使用同一份远端路径。
  const remoteZCodeTaskService = params.createRemotePromptAttachmentTaskService(
    reportingRemoteZCodeTaskService,
  );
  const remoteZCodeSessionService = params.createRemotePromptAttachmentSessionService(
    params.connectionServices.zcodeSessionService,
  );
  const remoteProviderProvisioningService =
    createRemoteProviderProvisioningExecutorFromWorkspace(params);

  // desktop-attached remote 的 Agent 运行在远端，但 app-global 设置权威仍在
  // desktop shared Host。通过窄化的 runtime-preferences 请求原路返回，避免远端读取自己的 setting。
  const { onError } = params.runtimePreferencesBridge;
  params.connectionServices.zcodeAgentService.onDynamicSessionRuntimePreferencesRequest()(
    (request) => {
      const startedAt = Date.now();
      const requestContext = {
        event: "zcode_protocol.runtime_preferences.host_request_received",
        module: "desktop.host.remote_workspace",
        requestId: request.requestId,
        scope: request.scope,
        sessionId: request.sessionId,
      };
      // 诊断：Agent 侧超时只能说明没有拿到响应；这里记录 Host 是否收到请求，
      // 用“收到但无 response”区分 transport 丢包和设置读取卡住。
      runtimePreferencesLogger.info(
        undefined,
        "runtime preferences host request received",
        requestContext,
      );
      void (async () => {
        const trackStage = <T>(stage: string, promise: Promise<T>): Promise<T> => {
          const stageStartedAt = Date.now();
          return promise.then(
            (value) => {
              runtimePreferencesLogger.debug(
                undefined,
                "runtime preferences host stage completed",
                {
                  ...requestContext,
                  durationMs: Math.max(0, Date.now() - stageStartedAt),
                  stage,
                },
              );
              return value;
            },
            (error: unknown) => {
              runtimePreferencesLogger.warn(undefined, "runtime preferences host stage failed", {
                ...requestContext,
                durationMs: Math.max(0, Date.now() - stageStartedAt),
                error: error instanceof Error ? error.message : String(error),
                stage,
              });
              throw error;
            },
          );
        };
        let resolution:
          | { status: "resolved"; preferences: ZCodeSessionRuntimePreferencesResult }
          | { status: "failed"; message: string };
        try {
          // 与本地 Host 同源：固定预算不依赖配置网关，远程/手机偏好响应不再串行等待网络。
          const settings = await trackStage("settings", localSettingService.get());
          const modelContextBudgetStrategy = DEFAULT_ZCODE_MODEL_CONTEXT_BUDGET_STRATEGY;
          resolution = {
            status: "resolved",
            preferences: {
              askUserQuestionAutoResolutionEnabled:
                settings.askUserQuestionAutoResolutionEnabled !== false,
              nativeSearchEnhancementsEnabled: settings.nativeSearchEnhancementsEnabled !== false,
              memoryEnabled: settings.memoryEnabled === true,
              modelContextBudgetStrategy,
              // 与本地 Host 同源：远端 workspace 的危险命令策略也来自同一份设置。
              // 缺席即严格（CLI 侧解释），不在这里补默认值。
              dangerousCommandPolicy: settings.dangerousCommandPolicy,
              // remote workspace 与本地 Host 保持同一 scope 边界，首次执行不得再次等待 client config。
              ...(request.scope === "user-execution" && settings.integratedTerminalShell
                ? { integratedTerminalShell: settings.integratedTerminalShell }
                : {}),
            },
          };
        } catch (error) {
          resolution = {
            status: "failed",
            message: error instanceof Error ? error.message : String(error),
          };
          runtimePreferencesLogger.warn(undefined, "runtime preferences host resolution failed", {
            ...requestContext,
            durationMs: Math.max(0, Date.now() - startedAt),
            error: resolution.message,
          });
        }
        // 只把设置读取失败编码为 -32603；发送失败交给最终 onError 记录，不能重试同一请求。
        await params.connectionServices.zcodeAgentService.respondSessionRuntimePreferences({
          requestId: request.requestId,
          resolution,
        });
        runtimePreferencesLogger.info(undefined, "runtime preferences host response sent", {
          ...requestContext,
          durationMs: Math.max(0, Date.now() - startedAt),
          resolutionStatus: resolution.status,
        });
      })().catch((error: unknown) => {
        runtimePreferencesLogger.warn(undefined, "runtime preferences host response failed", {
          ...requestContext,
          durationMs: Math.max(0, Date.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        });
        onError(error);
      });    },
    ensureConversation: async () =>
      (await params.connectionServices.fileService.ensureConversationWorkspace()).path,
  });
}

export function createServerRemoteWorkspaceServiceCollection(params: {
  clientConfigService: IClientConfigService;
  connectionServices: IServiceAccessor;
  virtualProjects?: boolean;
  serverId?: string;
  targetKind: RemoteTarget["kind"];
  /** 本机 Local Host 服务；提供 Provider Provisioning Source，缺失时 Provisioning 按 unsupported 处理。 */
  sourceServices?: ServiceCollection;
}): ServiceCollection {
  assertRemoteWorkspaceRpcContract(params.connectionServices);
  // Server remote 连接的是一个已经运行的完整 ZCode server。
  // Host 只做 RPC 转接，不替 server 决定 workspace/runtime/provider 归属；
  // Provider 配置只经 Host 私有的 Provisioning executor 从本机单向下发到远端。
  const remoteProviderProvisioningExecutor =
    createRemoteProviderProvisioningExecutorFromWorkspace(params);
  const services = new ServiceCollection()
    .register(IFileService, params.connectionServices.fileService)
    // 根因：客户端已有 gen-ui 代理，但 Host 漏转发使远端读取成为 Unknown channel。
    // 复用 Source 的读取与输出目录校验；桌面状态/沙箱仍由 base services 提供。
    .register(IGenUiService, params.connectionServices.genUiService)
    .register(IMediaPreviewService, params.connectionServices.mediaPreviewService)
    .register(IGitService, params.connectionServices.gitService)
    .register(IGitCheckpointService, params.connectionServices.gitCheckpointService)
    .register(ISystemService, params.connectionServices.systemService)
    .register(ITerminalService, params.connectionServices.terminalService)
    .register(ISettingService, params.connectionServices.settingService)
    // Bug 原因：远程集合曾漏注册此通道，手机重建 Root 后调用失败，回退 settings 判定而误弹引导。
    // 引导记录必须与该入口的 settings/OAuth 同源：R3 下四种 transport 都由 Source 持有，不借用本机记录。
    .register(IOnboardingRecordService, params.connectionServices.onboardingRecordService)
    .register(ICredentialService, params.connectionServices.credentialService)
    .register(IBroadcastService, params.connectionServices.broadcastService)
    .register(IZCodeTaskService, params.connectionServices.zcodeTaskService)
    .register(IZCodeAgentService, params.connectionServices.zcodeAgentService)
    .register(IZCodeSessionService, params.connectionServices.zcodeSessionService)
    // R3 的分享属于目标 Environment；不能恢复旧 SSH 的本机 JWT 混装。
    .register(
      IConversationShareService,
      params.targetKind === "server"
        ? createUnsupportedRemoteConversationShareService()
        : params.connectionServices.conversationShareService,
    )
    .register(IBotsService, params.connectionServices.botsService)
    .register(IFileWatcherService, params.connectionServices.fileWatcherService)
    .register(IOAuthService, params.connectionServices.oauthService)
    .register(IProviderSettingsService, params.connectionServices.providerSettingsService)
    .register(IModelSelectionService, params.connectionServices.modelSelectionService)
    .register(ISourceServerWorkspaceService, params.connectionServices.sourceServerWorkspaceService)
    .register(IUsageStatsService, params.connectionServices.usageStatsService)
    .register(
      ICodingPlanSubscriptionService,
      params.connectionServices.codingPlanSubscriptionService,
    )
    .register(IClientConfigService, params.clientConfigService)
    .register(IClientScenesService, params.connectionServices.clientScenesService)
    .register(ISkillsService, params.connectionServices.skillsService)
    .register(ISkillSyncService, params.connectionServices.skillSyncService)
    .register(IMcpSyncService, params.connectionServices.mcpSyncService)
    // Bug 原因：RPC 合同已经要求 plugin-sync，但旧全转发集合漏注册，远端插件同步会在 Host
    // 二次暴露时变成 Unknown channel。全转发集合必须与合同逐项一致。
    .register(IPluginSyncService, params.connectionServices.pluginSyncService)
    .register(IPluginsService, params.connectionServices.pluginsService)
    .register(IPluginManagementService, params.connectionServices.pluginManagementService)
    .register(ISubagentsService, params.connectionServices.subagentsService)
    .register(ICommandsService, params.connectionServices.commandsService)
    .register(IHooksService, params.connectionServices.hooksService)
    .register(IMemoryService, params.connectionServices.memoryService)
    .register(IOutputStyleService, params.connectionServices.outputStyleService)
    .register(ISettingsSyncService, params.connectionServices.settingsSyncService)
    .register(
      IPromptAttachmentTransferService,
      params.connectionServices.promptAttachmentTransferService,
    );
  // 新频道必须以握手能力为准；客户端总能生成 proxy，不能用对象存在性判断旧 Server 支持。
  if (params.virtualProjects) {
    if (
      !params.connectionServices.projectService ||
      !params.connectionServices.remoteProjectService
    )
      throw new Error("Remote virtual-project RPC registration incomplete");
    services.register(IProjectService, params.connectionServices.projectService);
    services.register(IRemoteProjectService, params.connectionServices.remoteProjectService);
  } else if (params.serverId) {
    services.register(
      IProjectService,
      resolveServerProjectService({ ...params, serverId: params.serverId }),
    );
    services.register(
      IRemoteProjectService,
      createRemoteProjectService({
        controller: false,
        database: async () => {
          throw new Error("remote-project.controller-only");
        },
      }),
    );
  }
  const controllerGroups = params.sourceServices?.getOptional(ITaskGroupService);
  const controllerBroadcast = params.sourceServices?.getOptional(IBroadcastService);
  if (controllerGroups) services.register(ITaskGroupService, controllerGroups);
  if (controllerGroups && controllerBroadcast) {
    const remoteBroadcast = params.connectionServices.broadcastService;
    services.register(IBroadcastService, {
      send: (message) =>
        (message.channel === "state:task-groups" ? controllerBroadcast : remoteBroadcast).send(
          message,
        ),
      acquireClaim: (key) => remoteBroadcast.acquireClaim(key),
      commitClaim: (lease) => remoteBroadcast.commitClaim(lease),
      releaseClaim: (lease) => remoteBroadcast.releaseClaim(lease),
      tryClaim: (key) => remoteBroadcast.tryClaim(key),
      onMessage: (listener) => {
        const remote = remoteBroadcast.onMessage((event) => {
          if (event.channel !== "state:task-groups") listener(event);
        });
        const local = controllerBroadcast.onMessage((event) => {
          if (event.channel === "state:task-groups") listener(event);
        });
        return {
          dispose: () => {
            remote.dispose();
            local.dispose();
          },
        };
      },
    });
  }
  const registrationKeys = new Set(REMOTE_WORKSPACE_RPC_REGISTRATIONS.map(([key]) => key));
  const missing = [
    ...REMOTE_WORKSPACE_RPC_CHANNELS.filter((key) => !registrationKeys.has(key)),
    ...REMOTE_WORKSPACE_RPC_REGISTRATIONS.filter(
      ([, descriptor]) =>
        services.getOptional(descriptor as ServiceDescriptor<unknown>) === undefined,
    ).map(([key]) => key),
  ];
  if (missing.length > 0) {
    throw new Error(`Remote workspace RPC registration incomplete: ${missing.join(", ")}`);
  }
  registerRemoteProviderProvisioningExecutor(services, remoteProviderProvisioningExecutor);
  return services;
}
