/**
 * useTabPersistence —— 标签页持久化
 *
 * - mount 时从 settingService 恢复上次打开的标签页
 * - 订阅 tab store 变化，debounce 写回 settingService
 */
import { useEffect, useRef } from "react";
import { useState } from "react";
import type { AppSettings } from "@zcode/shared";
import type { ISettingService } from "@zcode/services";
import { readPersistedWorkspaceSessionEntries } from "@/lib/remoteWorkspaceHistory.js";
import { useTabStoreApi } from "../store/TabStoreProvider.js";
import { isWorkspaceTab, type TabStoreState } from "../store/tabStore.js";
import { logger } from "../logger.js";

const DEBOUNCE_MS = 300;

export interface TabPersistenceRestoreLifecycle {
  settingService?: ISettingService;
  restoreSession: boolean;
  completed: boolean;
  fullyCompleted: boolean;
}

/**
 * 活动目录选择的写回门禁。
 *
 * 这个对象由 Root 在本地窗口内共享给远程 session 流程：恢复未完成或失败时，
 * 远程连接状态变化只能更新内存，不能把半份 tab 快照写回全局 settings。
 */
export interface WorkspacePersistenceGate {
  canPersist: boolean;
  restoreFailed: boolean;
  onCanPersist?: () => void | Promise<void>;
}

function openWorkspacePersistenceGate(
  persistenceGate: WorkspacePersistenceGate | undefined,
  persistSession: boolean,
): void {
  if (!persistenceGate) return;
  persistenceGate.canPersist = Boolean(persistSession);
  if (persistenceGate.canPersist) {
    void persistenceGate.onCanPersist?.();
  }
}

export interface TabPersistenceRestoreResult {
  /** 恢复期间识别出的 app-owned 路径，不得回填为最近项目。 */
  excludedRecentProjectPaths?: readonly string[];
  /** active workspace 已恢复后，在首帧后的 idle period 补齐 inactive workspace。 */
  deferredRestore?: () => void;
}

function scheduleDeferredRestore(callback: () => void): () => void {
  if (typeof globalThis.requestIdleCallback === "function") {
    const idleCallbackId = globalThis.requestIdleCallback(() => callback(), {
      timeout: 1_000,
    });
    return () => globalThis.cancelIdleCallback(idleCallbackId);
  }

  const timer = globalThis.setTimeout(callback, 0);
  return () => globalThis.clearTimeout(timer);
}

export function hasCompletedTabPersistenceInitialRestore({
  settingService,
  restoreSession,
  restoreLifecycle,
}: {
  settingService?: ISettingService;
  restoreSession: boolean;
  restoreLifecycle: TabPersistenceRestoreLifecycle;
}): boolean {
  const shouldRestoreSession = Boolean(settingService && restoreSession);
  return (
    !shouldRestoreSession ||
    (restoreLifecycle.settingService === settingService &&
      restoreLifecycle.restoreSession === restoreSession &&
      restoreLifecycle.completed)
  );
}

<<<<<<< HEAD
export function getRecentProjectPathsFromSettings(
  settings: Pick<AppSettings, "lastWorkspaceSession">,
  excludedPaths: readonly string[] = [],
): string[] {
  const excludedPathSet = new Set(excludedPaths);
  return readPersistedWorkspaceSessionEntries(settings)
    .flatMap((entry) =>
      entry.kind === "local" &&
      entry.workspacePurpose !== "conversation" &&
      !excludedPathSet.has(entry.workspacePath)
        ? [entry.workspacePath]
        : [],
    )
    .slice(0, 10);
}

export function buildRestoredRecentProjectPaths(
  settings: Pick<AppSettings, "lastWorkspaceSession" | "recentProjects">,
  excludedPaths: readonly string[] = [],
): string[] {
  const excludedPathSet = new Set(excludedPaths);
  const existingRecent = (settings.recentProjects ?? []).filter(
    (path) => !excludedPathSet.has(path),
  );
  const restoredProjects = getRecentProjectPathsFromSettings(settings, excludedPaths);
  return [...new Set([...existingRecent, ...restoredProjects])].slice(0, 10);
}

/**
 * 默认持久化补丁（导出以便护栏直接断言补丁内容）。
 *
 * 导出理由：fix.2 的验收要求「点击注册表行后 lastWorkspaceSession 逐字不变」，
 * 而该约束的落点就是这个函数。若只能通过 hook 间接验证，断言会退化成源码扫描
 * （扫 "viewOnly" 字样），无法证明过滤真的生效。导出后可以直接喂一个含 viewOnly tab 的
 * store 快照，断言补丁里没有它。
 */
export function buildDefaultPersistPatch(state: TabStoreState): Partial<AppSettings> {
  // fix.2 / Task F1：viewOnly tab 不进设置。
  //
  // 这是「点击注册表行后 lastWorkspaceSession 逐字不变」护栏的落点：注册表行的点击需要一个 tab
  // 承载激活态（activeWorkspacePath/activeTabId 被 Root 与多处 hook 读取），但那条工作区不是
  // 本客户端的显示偏好。写回设置就等于让设置重新参与枚举 —— 正是
  // workspace-registry.md 第 2.3 节要消灭的第二份真相源，也是「点击后消失」的持久化后果
  // （131 号报告第 3 节 (d)）。
  //
  // 为什么过滤放在这里而不是「点击时跳过写设置」：写入是 300ms 防抖 + 订阅整个 store 的，
  // 任何一次无关的 tab 变化都会带着它一起落盘。只有让 viewOnly tab 根本不进入 patch，
  // 才能保证逐字不变。
  const workspaceTabs = state.tabs
    .filter(isWorkspaceTab)
    .filter((tab) => !tab.remoteSessionId)
    .filter((tab) => !tab.viewOnly);
  const activeIndex = state.activeWorkspacePath
    ? workspaceTabs.findIndex((tab) => tab.workspacePath === state.activeWorkspacePath)
    : 0;

=======
function buildDefaultPersistPatch(state: TabStoreState): Partial<AppSettings> {
  const tab = state.tabs
    .filter(isWorkspaceTab)
    .find(
      (candidate) =>
        (candidate.workspaceIdentity?.trim() || candidate.workspacePath) ===
        (state.activeWorkspaceIdentity?.trim() || state.activeWorkspacePath),
    );
  if (tab?.workspaceIdentity || tab?.remoteSessionId) return {};
>>>>>>> zai-org/main
  return {
    lastActiveWorkspace: tab
      ? {
          kind: "local",
          workspacePath: tab.workspacePath,
          ...(tab.workspacePurpose ? { workspacePurpose: tab.workspacePurpose } : {}),
        }
      : null,
  };
}

export function useTabPersistence({
  settingService,
  restoreSession = true,
  persistSession = restoreSession,
  persistenceGate,
  restorePersistedSession,
  buildPersistPatch,
}: {
  settingService?: ISettingService;
  /** 是否恢复上次会话，首个窗口 true，新窗口 false */
  restoreSession?: boolean;
  /** 是否把当前窗口会话写回全局设置，首个窗口 true，新窗口 false */
  persistSession?: boolean;
  /** 与远程 session 流程共享的活动目录写回门禁。 */
  persistenceGate?: WorkspacePersistenceGate;
  /** 自定义恢复流程；不传则回退到原来的本地 tab 恢复逻辑 */
  restorePersistedSession?: (
    settings: AppSettings,
  ) => Promise<TabPersistenceRestoreResult | void> | TabPersistenceRestoreResult | void;
  /** 自定义持久化补丁；不传则只写回本地 workspace 会话 */
  buildPersistPatch?: (state: TabStoreState, settings: AppSettings) => Partial<AppSettings>;
}) {
  const store = useTabStoreApi();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldRestoreSession = Boolean(settingService && restoreSession);
  const initialRestoreFullyCompletedRef = useRef(!shouldRestoreSession);
  const [restoreLifecycle, setRestoreLifecycle] = useState<TabPersistenceRestoreLifecycle>(() => ({
    settingService,
    restoreSession,
    completed: !shouldRestoreSession,
    fullyCompleted: !shouldRestoreSession,
  }));
  // provider/OAuth gate 从 false 切到 true 的同一轮 render 里，
  // 恢复会话 effect 还没来得及把 isRestoring 设为 true。这里把完成态绑定到
  // 当前 settingService + restoreSession，避免 initialWorkspacePath 抢在 restoreTabs 前 addTab。
  const hasCompletedInitialRestore = hasCompletedTabPersistenceInitialRestore({
    settingService,
    restoreSession,
    restoreLifecycle,
  });
  const hasCompletedFullRestore =
    !shouldRestoreSession ||
    (restoreLifecycle.settingService === settingService &&
      restoreLifecycle.restoreSession === restoreSession &&
      restoreLifecycle.fullyCompleted);
  const isRestoring = shouldRestoreSession && !hasCompletedInitialRestore;

  // 恢复会话
  useEffect(() => {
    if (!settingService || !restoreSession) {
      initialRestoreFullyCompletedRef.current = true;
      openWorkspacePersistenceGate(persistenceGate, persistSession);
      setRestoreLifecycle({
        settingService,
        restoreSession,
        completed: true,
        fullyCompleted: true,
      });
      return;
    }

    let cancelled = false;
    let cancelDeferredRestore: (() => void) | null = null;
    initialRestoreFullyCompletedRef.current = false;
    if (persistenceGate) {
      persistenceGate.canPersist = false;
      persistenceGate.restoreFailed = false;
    }
    // Bugfix: Root 首屏会先按 tab store 的默认空状态渲染打开工作区中间页，
    // 随后这里再异步恢复 lastWorkspaceSession，导致主界面启动时闪一下“打开项目”。
    // 这里显式暴露恢复中的状态，让外层在会话检查完成前持续显示 loading，
    // 避免把“默认空态”误展示给用户。
    setRestoreLifecycle({
      settingService,
      restoreSession,
      completed: false,
      fullyCompleted: false,
    });

    settingService
      .get()
      .then(async (settings) => {
        let restoreResult: TabPersistenceRestoreResult | void = undefined;
        if (restorePersistedSession) {
          restoreResult = await restorePersistedSession(settings);
        } else {
          const tabs = readPersistedWorkspaceSessionEntries(settings).flatMap((entry) =>
            entry.kind === "local"
              ? [
                  entry.workspacePurpose
                    ? {
                        workspacePath: entry.workspacePath,
                        workspacePurpose: entry.workspacePurpose,
                      }
                    : entry.workspacePath,
                ]
              : [],
          );
          const activeIndex = settings.lastActiveTabIndex ?? 0;
          if (tabs.length > 0) {
            logger.info("[useTabPersistence] 恢复标签页:", tabs);
            store.getState().restoreTabs(tabs, activeIndex);
          }
        }

        if (!cancelled) {
          const deferredRestore = restoreResult?.deferredRestore;
          setRestoreLifecycle({
            settingService,
            restoreSession,
            completed: true,
            fullyCompleted: !deferredRestore,
          });
          if (deferredRestore) {
            cancelDeferredRestore = scheduleDeferredRestore(() => {
              if (cancelled) {
                return;
              }
              // active-only 是启动瞬态，不能提前持久化；补齐合并产生的 store event
              // 才是首个允许写回的完整 session snapshot。
              initialRestoreFullyCompletedRef.current = true;
              openWorkspacePersistenceGate(persistenceGate, persistSession);
              try {
                deferredRestore();
              } catch (error) {
                logger.error("[useTabPersistence] 补齐 inactive workspace 失败:", error);
              } finally {
                if (!cancelled) {
                  setRestoreLifecycle({
                    settingService,
                    restoreSession,
                    completed: true,
                    fullyCompleted: true,
                  });
                }
              }
            });
          } else {
            initialRestoreFullyCompletedRef.current = true;
            openWorkspacePersistenceGate(persistenceGate, persistSession);
          }
        }
      })
      .catch((err) => {
        logger.error("[useTabPersistence] 恢复标签页失败:", err);
        if (!cancelled) {
          // 恢复失败时必须 fail-closed；当前 renderer 的 tabs 不是磁盘快照的完整替代品。
          // 只停止 loading，不允许后续远程断连/关闭事件覆盖 setting.json。
          initialRestoreFullyCompletedRef.current = false;
          if (persistenceGate) {
            persistenceGate.canPersist = false;
            persistenceGate.restoreFailed = true;
          }
          setRestoreLifecycle({
            settingService,
            restoreSession,
            completed: true,
            fullyCompleted: true,
          });
        }
      });

    return () => {
      cancelled = true;
      cancelDeferredRestore?.();
    };
  }, [
    persistSession,
    persistenceGate,
    restorePersistedSession,
    settingService,
    restoreSession,
    store,
  ]);

  // 持久化：订阅 store 变化，debounce 写入
  useEffect(() => {
    if (!settingService || !persistSession) return;

    const unsubscribe = store.subscribe((state) => {
      if (!initialRestoreFullyCompletedRef.current) {
        return;
      }
      if (persistenceGate && !persistenceGate.canPersist) {
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        // 新开的次级窗口如果也把自己的标签页写回全局设置，
        // 会把主窗口真正想恢复的会话覆盖掉，导致下次启动恢复到错误窗口。
        // 这里把“是否持久化会话”独立成开关，只让首个本地窗口负责写回。
        // Bug 原因：remote legacy identity 的单一来源在最新 AppSettings；旧写入者只拿 tab
        // state，默认空 history 会把冻结 identity 改写成当前线路。写前读取同一 settings 快照。
        settingService
          .get()
          .then((settings) =>
            settingService.update(
              buildPersistPatch
                ? buildPersistPatch(state, settings)
                : buildDefaultPersistPatch(state),
            ),
          )
          .catch((err) => {
            logger.error("[useTabPersistence] 持久化失败:", err);
          });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [buildPersistPatch, persistSession, persistenceGate, store, settingService]);

  return { isRestoring, hasCompletedInitialRestore, hasCompletedFullRestore };
}
