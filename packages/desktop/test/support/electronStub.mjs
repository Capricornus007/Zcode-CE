/**
 * electron 模块的测试桩（autoUpdaterDarwinSkip.test.ts 专用）。
 *
 * autoUpdater.ts 顶部静态导入 electron 的 app / BrowserWindow / ipcMain / Menu，
 * 在 node:test 里真实 electron 不可用（其 main 导出是二进制路径字符串，命名导入必然失败）。
 * 由 stubResolver.mjs 把 "electron" 说明符重定向到本文件后，这些导入全部落到桩上。
 *
 * 注意本文件必须是纯 JS（.mjs 由 Node 原生编译，不能含任何 TS 类型语法）。
 * 桩是"最小够用"的：只实现被测路径真正会调到的成员；断言用计数器暴露调用事实。
 */

export const stubApp = {
  isPackaged: false,
  getVersion: () => "3.14.3-ce.4",
  // registerDeepLinkProtocol 注册调用事实(供 deep-link 加固测试断言)。
  protocolClientCalls: [],
  setAsDefaultProtocolClient(scheme, executablePath, args) {
    this.protocolClientCalls.push({ scheme, executablePath, args });
    return true;
  },
  resetProtocolClientCalls() {
    this.protocolClientCalls.length = 0;
  },
  // desktopMainIpcRemote 注册时挂 browser-window-created 监听(测试不触发该事件)。
  on() {},
  off() {},
  removeListener() {},
  // pluginSandbox/host.ts 读 userData/locale(partitions 与 locale 派生);测试可覆盖。
  getPath(name) {
    return `/fixture-${name}`;
  },
  getLocale() {
    return "en-US";
  },
};

// desktopHostProcess.ts 静态导入 MessageChannelMain(lifecycle 链路 F10 测试拉到);
// 链路阶段必须有命名导出,结构字段不进入断言。
export class StubMessageChannelMain {
  constructor() {
    this.port1 = {};
    this.port2 = {};
  }
}

// desktopOAuthDeepLink.ts 静态导入 dialog(命名导入链路阶段必须有导出);deep-link 注册路径不调用它。
export const stubDialog = {};

// open-external 路由测试用:捕获 shell.openExternal / openPath 调用事实。
export const stubShell = {
  openExternalCalls: [],
  openPathCalls: [],
  openExternal(url) {
    this.openExternalCalls.push(url);
    return Promise.resolve();
  },
  openPath(path) {
    this.openPathCalls.push(path);
    return Promise.resolve("");
  },
  resetShellCalls() {
    this.openExternalCalls.length = 0;
    this.openPathCalls.length = 0;
  },
};

// desktopNotifications.ts 链路阶段需要 Notification 命名导出;open-external 测试不实例化它。
export class StubNotification {
  constructor() {}
  show() {}
}

// embeddedBrowserPermissionUiBridge.ts 静态导入 webContents / desktopCapturer
// (F9 链路阶段必须有导出;permissionGovernance 测试只调用纯函数 parse*,
// prompt 路径的窗口/源查找由其它桩成员覆盖)。
export const stubWebContents = {
  fromId: () => undefined,
  // 沙箱 host 测试经 fromId 查找 guest;测试自行注册实例后覆写本函数。
  fromIdForTest(id) {
    return undefined;
  },
};
export const stubDesktopCapturer = {
  getSources: async () => [],
};

export const stubBrowserWindow = {
  getAllWindows: () => [],
  getFocusedWindow: () => null,
};

export const stubIpcMain = {
  handlers: new Map(),
  onListeners: new Map(),
  handle(channel, listener) {
    this.handlers.set(channel, listener);
  },
  on(channel, listener) {
    this.onListeners.set(channel, listener);
  },
  reset() {
    this.handlers.clear();
    this.onListeners.clear();
  },
};

export const stubMenu = {
  getApplicationMenu: () => null,
};

// autoUpdater.ts 用的是命名导入（具名 import），因此桩必须同时导出这些名字，
// 而不是只给一个 default 对象。
export const app = stubApp;
export const BrowserWindow = stubBrowserWindow;
export const ipcMain = stubIpcMain;
export const Menu = stubMenu;
export const dialog = stubDialog;
export const shell = stubShell;
export const Notification = StubNotification;
export const webContents = stubWebContents;
export const desktopCapturer = stubDesktopCapturer;
export const MessageChannelMain = StubMessageChannelMain;

// desktopHostProcess.ts 静态导入 utilityProcess(lifecycle 链路 F10 测试拉到);
// 测试不 spawn host 进程,挡住链路阶段的命名导入即可。
export const stubUtilityProcess = {
  fork: () => {
    throw new Error("stubUtilityProcess.fork not implemented in tests");
  },
};
export const utilityProcess = stubUtilityProcess;

// desktopWindowButtonPosition.ts / index 链路静态导入(lifecycle F10 测试拉到);
// 仅满足链路阶段的命名导入。
export const nativeTheme = { shouldUseDarkColors: false, on() {}, off() {}, removeListener() {} };
export const screen = {
  getPrimaryDisplay: () => ({
    workArea: { x: 0, y: 0, width: 1280, height: 720 },
    workAreaSize: { width: 1280, height: 720 },
    bounds: { x: 0, y: 0, width: 1280, height: 720 },
    scaleFactor: 1,
  }),
  on() {},
  off() {},
  removeListener() {},
};
export const powerSaveBlocker = {
  start: () => 1,
  stop() {},
};

// pluginSandbox/host.ts 静态导入 session(lifecycle 链路经拉入);链路阶段需命名导出,
// fromPartition 返回空操作 session——沙箱行为由 pluginSandbox 专属测试覆盖,不进本桩断言。
export const stubSession = {
  protocol: {
    registerStringProtocol() {},
    unregisterStringProtocol() {},
    handle() {},
    unhandle() {},
    isProtocolHandled: () => false,
  },
  webRequest: { onBeforeRequest() {}, onBeforeSendHeaders() {}, onErrorOccurred() {} },
  setPermissionRequestHandler() {},
  setPermissionCheckHandler() {},
  setDevicePermissionHandler() {},
  on() {},
  off() {},
  removeListener() {},
  setProxy: async () => undefined,
  clearStorageData: async () => undefined,
  clearCache: async () => undefined,
};
export const session = { fromPartition: () => stubSession };
export const nativeImage = {
  createEmpty: () => ({ isEmpty: true }),
  resize: (image) => image,
  fromPath: () => ({ isEmpty: false, getSize: () => ({ width: 16, height: 16 }) }),
};
export const clipboard = {
  readText: () => "",
  writeText() {},
  availableFormats: () => [],
};
export const systemPreferences = {
  getUserDefault: () => "",
  on() {},
  off() {},
  removeListener() {},
};

const electron = {
  app: stubApp,
  BrowserWindow: stubBrowserWindow,
  ipcMain: stubIpcMain,
  Menu: stubMenu,
  dialog: stubDialog,
  shell: stubShell,
  Notification: StubNotification,
  webContents: stubWebContents,
  desktopCapturer: stubDesktopCapturer,
  MessageChannelMain: StubMessageChannelMain,
  utilityProcess: stubUtilityProcess,
  nativeTheme,
  screen,
  powerSaveBlocker,
  nativeImage,
  clipboard,
  systemPreferences,
};

export default electron;
