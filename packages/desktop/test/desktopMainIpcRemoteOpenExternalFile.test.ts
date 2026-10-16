import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformChannels } from "@zcode/shared";

type IpcHandler = (...args: unknown[]) => unknown;
type RemoteIpcOptions = Parameters<
  typeof import("../src/main/desktopMainIpcRemote.js").registerRemoteIpcHandlers
>[0];

const h = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  listeners: new Map<string, IpcHandler>(),
  fromWebContents: vi.fn(),
  registerWebRemoteControlIpcHandlers: vi.fn(),
  shellOpenExternal: vi.fn(),
  shellOpenPath: vi.fn(),
  configureRemoteUsageArmsTelemetry: vi.fn(),
  reportRemoteConnectResultToArms: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    on: vi.fn(),
  },
  BrowserWindow: {
    fromWebContents: h.fromWebContents,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => h.handlers.set(channel, handler)),
    on: vi.fn((channel: string, handler: IpcHandler) => h.listeners.set(channel, handler)),
  },
  shell: {
    openExternal: h.shellOpenExternal,
    openPath: h.shellOpenPath,
  },
}));

vi.mock("../src/main/desktopNotifications.js", () => ({
  dispatchTaskNotification: vi.fn(),
}));

vi.mock("../src/main/desktopOAuthDeepLink.js", () => ({
  clearOAuthRoutesForWindow: vi.fn(),
  deliverPendingDeepLink: vi.fn(() => false),
  parseOAuthStateRegistration: vi.fn(),
  registerOAuthState: vi.fn(),
}));

vi.mock("../src/main/desktopArmsCustomEvent.js", () => ({
  createFinalArmsCustomEventE2EController: vi.fn(),
  dispatchFinalArmsCustomEvent: vi.fn(),
}));

vi.mock("../src/main/desktopWebRemoteControlIpc.js", () => ({
  registerWebRemoteControlIpcHandlers: h.registerWebRemoteControlIpcHandlers,
}));

vi.mock("../src/main/desktopRemoteUsageArmsTelemetry.js", () => ({
  configureRemoteUsageArmsTelemetry: h.configureRemoteUsageArmsTelemetry,
  reportRemoteConnectResultToArms: h.reportRemoteConnectResultToArms,
}));

function createOptions(): RemoteIpcOptions {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    appTelemetryRuntime: {
      onRendererReady: vi.fn(),
      syncRendererContext: vi.fn(),
      onOAuthCallbackHandled: vi.fn(),
    },
    appTelemetryCore: {
      reportEvent: vi.fn(async () => {}),
    },
    reportRemoteUsageEvent: vi.fn(),
    armsCustomContext: {
      deviceMid: "device-mid",
      platform: "darwin",
      appVersion: "1.0.0",
      armsEnv: "local",
    },
    webRemoteControlManager: {
      authorizeStart: vi.fn(),
      startAuthorized: vi.fn(),
      resetPairingAuthorized: vi.fn(),
      stop: vi.fn(),
      getStatus: vi.fn(),
    },
    createRemoteWorkspaceSession: vi.fn(async () => "remote-session-1"),
    disposeRemoteWorkspaceSession: vi.fn(),
    cancelPendingRemoteWorkspaceSessionsForWindow: vi.fn(),
    bindRemoteWorkspaceSessionContext: vi.fn(),
    confirmRendererAttachmentReady: vi.fn(),
    getRemoteConnectionStats: vi.fn(() => ({
      activeSessionCount: 0,
      activeTargetCount: 0,
    })),
    isDockerDaemonAvailable: vi.fn(async () => true),
    listAvailableWSLDistros: vi.fn(async () => []),
    listAvailableDockerContainers: vi.fn(async () => []),
    listSSHConfigAliases: vi.fn(async () => []),
  };
}

async function registerOpenExternalListener() {
  const { registerRemoteIpcHandlers } = await import("../src/main/desktopMainIpcRemote.js");
  const options = createOptions();
  registerRemoteIpcHandlers(options);
  const listener = h.listeners.get(PlatformChannels.OpenExternal);
  expect(listener).toBeDefined();
  return { listener: listener!, options };
}

describe("OpenExternal 对 file URL 的分流", () => {
  beforeEach(() => {
    h.handlers.clear();
    h.listeners.clear();
    h.fromWebContents.mockReset();
    h.shellOpenExternal.mockReset().mockResolvedValue(undefined);
    h.shellOpenPath.mockReset().mockResolvedValue("");
  });

  it("中文与空格的 file URL 走 shell.openPath 且收到解码后的本地路径", async () => {
    const { listener } = await registerOpenExternalListener();
    const sender = { getURL: vi.fn(() => "about:blank") };

    listener({ sender }, "file:///E:/04%20%E7%B4%A0%E6%9D%90/page.html");

    await vi.waitFor(() => expect(h.shellOpenPath).toHaveBeenCalledTimes(1));
    expect(h.shellOpenPath).toHaveBeenCalledWith(expect.stringContaining("04 素材"));
    expect(h.shellOpenPath).toHaveBeenCalledWith(expect.stringContaining("page.html"));
    expect(h.shellOpenPath).not.toHaveBeenCalledWith(expect.stringContaining("%"));
    expect(h.shellOpenExternal).not.toHaveBeenCalled();
  });

  it("带锚点的 file URL 剥掉 hash 后仍走 shell.openPath", async () => {
    const { listener } = await registerOpenExternalListener();
    const sender = { getURL: vi.fn(() => "about:blank") };

    // Windows 上 fileURLToPath 只接受盘符绝对路径；用盘符 URL 测 hash 剥离。
    listener({ sender }, "file:///C:/tmp/report.html#section");

    await vi.waitFor(() => expect(h.shellOpenPath).toHaveBeenCalledTimes(1));
    expect(h.shellOpenPath).not.toHaveBeenCalledWith(expect.stringContaining("#"));
    expect(h.shellOpenExternal).not.toHaveBeenCalled();
  });

  it("http URL 仍走 shell.openExternal", async () => {
    const { listener } = await registerOpenExternalListener();
    const sender = { getURL: vi.fn(() => "about:blank") };

    listener({ sender }, "https://example.com/docs");

    await vi.waitFor(() => expect(h.shellOpenExternal).toHaveBeenCalledTimes(1));
    expect(h.shellOpenExternal).toHaveBeenCalledWith("https://example.com/docs");
    expect(h.shellOpenPath).not.toHaveBeenCalled();
  });

  it("file URL 无法转换为本地路径时记录 warn 且不回退到 shell.openExternal", async () => {
    const { listener, options } = await registerOpenExternalListener();
    const sender = { getURL: vi.fn(() => "about:blank") };

    // Windows 上 UNC 路径（file://server/share）fileURLToPath 合法，不触发 warn；
    // POSIX-only 场景用真实非法形态（Windows 保留字符问号）确保转换抛错走 warn 分支。
    // Windows 上 UNC 路径（file://server/share）fileURLToPath 合法，不触发 warn；
    // 真正让转换抛错的形态是非 file 协议的合法 URL 混入（isAllowedExternalOpenUrl 已挡），
    // 这里直接用盘符 URL + 不存在的盘 letter Z: 在 realpath 失败仅 warn 不抛——改断言
    // openFileUrlInDefaultApp 的 try/catch 语义：用「抛错的 host 形态」file://加端口。
    listener({ sender }, "file://localhost:1/C:/tmp/page.html");

    await vi.waitFor(() => expect(options.logger.warn).toHaveBeenCalledTimes(1));
    expect(h.shellOpenPath).not.toHaveBeenCalled();
    expect(h.shellOpenExternal).not.toHaveBeenCalled();
  });
});
