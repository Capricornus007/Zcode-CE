import type { AppSettings, RemoteWorkspaceSessionEntry } from "@zcode/shared";
import { parseRemoteWorkspaceIdentity } from "@zcode/shared";
import {
  buildWorkspaceSessionKey,
  readPersistedWorkspaceSessionEntries,
  resolveRemoteWorkspaceSessionIdentity,
} from "@/lib/remoteWorkspaceHistory.js";
import { logger } from "@/logger.js";
import {
  isWorkspaceTab,
  type RestorableWorkspaceTab,
  type TabStore,
  type TabStoreState,
} from "@/store/tabStore.js";

function getRestorableWorkspaceKey(tab: string | RestorableWorkspaceTab): string {
  if (typeof tab === "string") {
    return tab;
  }
  return tab.workspaceIdentity?.trim() || tab.workspacePath;
}

function resolveRemoteConversationWorkspacePurpose(
  entry: Pick<
    RemoteWorkspaceSessionEntry,
    "workspaceIdentity" | "workspacePath" | "workspacePurpose"
  >,
  conversationWorkspaceMap: AppSettings["remoteConversationWorkspaceBySourceServerId"],
): RemoteWorkspaceSessionEntry["workspacePurpose"] {
  const parsedIdentity = parseRemoteWorkspaceIdentity(entry.workspaceIdentity ?? "");
  const canonicalConversationPath = parsedIdentity?.sourceServerId
    ? conversationWorkspaceMap?.[parsedIdentity.sourceServerId]?.workspacePath
    : undefined;
  return canonicalConversationPath === entry.workspacePath
    ? "conversation"
    : entry.workspacePurpose;
}

export function projectRemoteConversationWorkspacePurpose(
  remoteSessions: readonly RemoteWorkspaceSessionEntry[],
  conversationWorkspaceMap: AppSettings["remoteConversationWorkspaceBySourceServerId"],
): {
  remoteSessions: RemoteWorkspaceSessionEntry[];
  updatedEntries: Array<{
    workspacePath: string;
    workspaceIdentity?: string;
  }>;
} {
  const updatedEntries: Array<{
    workspacePath: string;
    workspaceIdentity?: string;
  }> = [];
  const projectedSessions = remoteSessions.map((entry) => {
    const workspacePurpose = resolveRemoteConversationWorkspacePurpose(
      entry,
      conversationWorkspaceMap,
    );
    if (workspacePurpose !== "conversation" || entry.workspacePurpose === "conversation") {
      return entry;
    }
    updatedEntries.push({
      workspacePath: entry.workspacePath,
      ...(entry.workspaceIdentity ? { workspaceIdentity: entry.workspaceIdentity } : {}),
    });
    return { ...entry, workspacePurpose };
  });
  return { remoteSessions: projectedSessions, updatedEntries };
}

/** 窗口只拥有活动选择；项目集合与旧版凭据快照由 Host 派生。 */
export function buildRemoteWorkspacePersistPatch(
  state: TabStoreState,
  remoteSessions: readonly RemoteWorkspaceSessionEntry[],
): Partial<AppSettings> {
  const remoteSessionMap = buildRemoteWorkspaceSessionEntryMap(remoteSessions);
  // fix.2 / Task F1：只承载激活态的 viewOnly tab 不进设置。
  //
  // 为什么在这里过滤：枚举的唯一来源是服务端注册表（workspace-registry.md 第 2.3 节），
  // 而点击一条注册表行需要一个 tab 承载激活态。若把它写回 lastWorkspaceSession，
  // 设置就重新变成了枚举来源 —— 那正是本能力要消灭的第二份真相源，也是
  // 「点击后消失」的持久化后果（131 号报告第 3 节 (d)）。
  // 过滤放在序列化入口而不是各写入点：写入点有两条（本函数与 useTabPersistence 的
  // buildDefaultPersistPatch），收口在一处才不会漏。
  const persistedTabs = state.tabs.filter((tab) => !(isWorkspaceTab(tab) && tab.viewOnly));
  const serializedWorkspaceSessions = buildPersistedWorkspaceSessionEntries(
    persistedTabs,
    remoteSessionMap,
  );
  const serializedRemoteWorkspaceKeys = new Set(
    serializedWorkspaceSessions.flatMap((entry) =>
      entry.kind === "remote" ? [buildWorkspaceSessionKey(entry)] : [],
    ),
  );
  const pendingRemoteSessions = remoteSessions.filter(
    (entry) => !serializedRemoteWorkspaceKeys.has(buildWorkspaceSessionKey(entry)),
  );
  // 索引必须与 lastWorkspaceSession 同口径：viewOnly tab 不在持久化列表里，
  // 若拿未过滤的 tabs 求索引，激活的恰好是 viewOnly 行时 lastActiveTabIndex 会指向
  // 持久化列表里的错误位置，下次启动恢复到别的项目。
  const workspaceTabs = persistedTabs.filter((tab) => tab.kind === "workspace");
  const activeIndex = state.activeWorkspacePath
    ? workspaceTabs.findIndex((tab) => tab.workspacePath === state.activeWorkspacePath)
    : 0;

  return {
    lastActiveWorkspace: {
      kind: "local",
      workspacePath: tab.workspacePath,
      ...(tab.workspacePurpose ? { workspacePurpose: tab.workspacePurpose } : {}),
    },
  };
}

export function restorePersistedRemoteWorkspaceSessions({
  settings,
  tabStoreApi,
  allowRemoteWorkspaceRestore = true,
  unavailableWorkspacePath,
  conversationWorkspacePath,
  remoteConversationWorkspaceBySourceServerId,
  restoreMode = "all",
}: {
  settings: AppSettings;
  tabStoreApi: TabStore;
  allowRemoteWorkspaceRestore?: boolean;
  unavailableWorkspacePath?: string;
  conversationWorkspacePath?: string;
  remoteConversationWorkspaceBySourceServerId?: AppSettings["remoteConversationWorkspaceBySourceServerId"];
  restoreMode?: "all" | "active-first";
}): { deferredRestore?: () => void } | undefined {
  const persistedSessions = readPersistedWorkspaceSessionEntries(settings);
  const conversationWorkspaceMap =
    remoteConversationWorkspaceBySourceServerId ??
    settings.remoteConversationWorkspaceBySourceServerId;

  if (persistedSessions.length === 0 && !conversationWorkspacePath) {
    return;
  }

  const restoredTabs: Array<string | RestorableWorkspaceTab> = [];
  const seenLocalWorkspacePaths = new Set<string>();
  const seenRemoteWorkspaceKeys = new Set<string>();
  // Renderer 恢复导航位置；Host 的本地预热筛选不能决定当前页签，否则远程焦点会丢失。
  const activeSessionIndex = Math.min(
    Math.max(settings.lastActiveTabIndex ?? 0, 0),
    persistedSessions.length - 1,
  );
  let restoredActiveIndex = 0;
  let canonicalConversationRestoredIndex: number | null = null;
  let shouldActivateCanonicalConversation = false;

  for (const [index, persistedEntry] of persistedSessions.entries()) {
    if (persistedEntry.kind === "local") {
      const isStaleConversationWorkspace = Boolean(
        settings.lastActiveWorkspace === undefined &&
        conversationWorkspacePath &&
        persistedEntry.workspacePurpose === "conversation" &&
        persistedEntry.workspacePath !== conversationWorkspacePath,
      );
      if (isStaleConversationWorkspace) {
        // 测试数据根目录或旧 data root 可能把多个 conversation backing path
        // 持久化下来；它们是同一个逻辑“无项目会话”，恢复时必须以 service 给出的
        // canonical path 为准，否则侧栏和定时任务选择器都会出现多个 default。
        logger.warn("[Root] 跳过非 canonical conversation workspace 恢复", {
          workspacePath: persistedEntry.workspacePath,
          conversationWorkspacePath,
        });
        if (index === activeSessionIndex) {
          shouldActivateCanonicalConversation = true;
          if (canonicalConversationRestoredIndex !== null) {
            restoredActiveIndex = canonicalConversationRestoredIndex;
          }
        }
        continue;
      }

      if (seenLocalWorkspacePaths.has(persistedEntry.workspacePath)) {
        logger.warn("[Root] 跳过重复的本地 workspace 恢复", {
          workspacePath: persistedEntry.workspacePath,
        });
        continue;
      }

      const isConversationWorkspace =
        persistedEntry.workspacePath === conversationWorkspacePath ||
        persistedEntry.workspacePurpose === "conversation";
      const workspacePurpose = isConversationWorkspace
        ? "conversation"
        : persistedEntry.workspacePurpose;
      const availability =
        !isConversationWorkspace && persistedEntry.workspacePath === unavailableWorkspacePath
          ? "unavailable-local-directory"
          : undefined;
      if (availability && index === activeSessionIndex && conversationWorkspacePath) {
        // Bug 根因：只标记不可用仍会激活失效项目，WorkspaceShell 不挂载 composer。
        // 恢复时直接选择已解析的无项目 cwd，保留失效入口供用户查看历史。
        shouldActivateCanonicalConversation = true;
        logger.info("[Root] 默认项目不可用，恢复无项目草稿", {
          workspacePath: persistedEntry.workspacePath,
          conversationWorkspacePath,
        });
      }
      restoredTabs.push(
        workspacePurpose || availability
          ? {
              workspacePath: persistedEntry.workspacePath,
              workspacePurpose,
              availability,
            }
          : persistedEntry.workspacePath,
      );
      seenLocalWorkspacePaths.add(persistedEntry.workspacePath);
      const restoredIndex = restoredTabs.length - 1;
      if (isConversationWorkspace) {
        canonicalConversationRestoredIndex = restoredIndex;
      }
      if (
        index === activeSessionIndex ||
        (isConversationWorkspace && shouldActivateCanonicalConversation)
      ) {
        restoredActiveIndex = restoredIndex;
      }
      continue;
    }

    const workspaceIdentity = resolveRemoteWorkspaceSessionIdentity(persistedEntry);
    const workspaceKey = workspaceIdentity?.trim() || persistedEntry.workspacePath;
    const workspacePurpose = resolveRemoteConversationWorkspacePurpose(
      persistedEntry,
      conversationWorkspaceMap,
    );
    // 停用远程无项目 UI 只跳过恢复，不能删除会话数据或 canonical 历史映射。
    if (workspacePurpose === "conversation") continue;
    if (seenRemoteWorkspaceKeys.has(workspaceKey)) {
      logger.warn("[Root] 跳过身份冲突的远程 workspace 恢复", {
        workspacePath: persistedEntry.workspacePath,
        workspaceIdentity,
      });
      continue;
    }

    if (!allowRemoteWorkspaceRestore) {
      // 远程连接入口被策略隐藏时，启动恢复不能悄悄拉起远程 workspace tab。
      // 否则用户看不到入口却仍保留“断连态远程项”，会造成展示与能力不一致。
      continue;
    }

    // 启动只恢复“断开态远程 tab”，不做自动重连。
    // 这样 setting.json 中的 lastConnectionStatus 才能真实反映上次结果，
    // 用户关闭的远端 tab 也不会在下次启动被后台拉回。
    restoredTabs.push({
      workspacePath: persistedEntry.workspacePath,
      remoteTarget: persistedEntry.target,
      workspaceIdentity,
      ...(workspacePurpose ? { workspacePurpose } : {}),
    });
    seenRemoteWorkspaceKeys.add(workspaceKey);
    if (index === activeSessionIndex) {
      restoredActiveIndex = restoredTabs.length - 1;
    }
  }

  if (
    (!settings.lastActiveWorkspace || shouldActivateCanonicalConversation) &&
    conversationWorkspacePath &&
    !seenLocalWorkspacePaths.has(conversationWorkspacePath)
  ) {
    // 修复原因：conversation backing workspace 是 app-owned cwd，旧设置里缺少它时，
    // 侧栏就不会订阅该 scope；若 purpose 丢失又会被当成项目。恢复阶段以 service
    // 解析出的 canonical path 为权威，非激活补建并强制标记 conversation。
    restoredTabs.push({
      workspacePath: conversationWorkspacePath,
      workspacePurpose: "conversation",
    });
    canonicalConversationRestoredIndex = restoredTabs.length - 1;
  }

  if (shouldActivateCanonicalConversation && canonicalConversationRestoredIndex !== null) {
    restoredActiveIndex = canonicalConversationRestoredIndex;
  }

  if (restoredTabs.length > 0) {
    if (restoreMode === "active-first" && restoredTabs.length > 1) {
      const activeTab = restoredTabs[restoredActiveIndex];
      if (activeTab) {
        const activeWorkspaceKey = getRestorableWorkspaceKey(activeTab);
        logger.info("[Root] 优先恢复 active workspace", {
          deferredCount: restoredTabs.length - 1,
        });
        tabStoreApi.getState().restoreTabs([activeTab], 0);
        return {
          deferredRestore: () => {
            const startupActiveStillOpen = tabStoreApi
              .getState()
              .tabs.filter(isWorkspaceTab)
              .some(
                (tab) =>
                  (tab.workspaceIdentity?.trim() || tab.workspacePath) === activeWorkspaceKey,
              );
            // active-first 保存的是旧 settings 快照；idle callback 前用户若关闭 active tab，
            // 直接 complete 会把它从旧快照复活。关闭属于本窗口新意图，补齐时必须排除该 identity。
            const tabsToComplete = startupActiveStillOpen
              ? restoredTabs
              : restoredTabs.filter(
                  (restoredTab) => getRestorableWorkspaceKey(restoredTab) !== activeWorkspaceKey,
                );
            logger.info("[Root] 首帧后补齐 inactive workspace", {
              count: tabsToComplete.length - (startupActiveStillOpen ? 1 : 0),
            });
            tabStoreApi.getState().completeTabRestore(tabsToComplete);
          },
        };
      }
    }
    logger.info("[Root] 恢复组合 workspace 会话", {
      count: restoredTabs.length,
      activeIndex: restoredActiveIndex,
    });
    tabStoreApi.getState().restoreTabs(restoredTabs, restoredActiveIndex);
  }
  return undefined;
}
