/**
 * MCP App 浏览器数据清理顺序(F5,移植上游 v3.15.1 vitest 用例)。
 * 上游用 vi.mock 隔离 electron/session/兄弟模块;本仓改用 electron 桩 + 真实模块链
 * (session/guestPolicy/protocol 均为纯逻辑 + 注入式接口,桩 session 记录清理顺序)。
 *
 * 运行:cd packages/desktop && node --import tsx --test test/pluginSandboxClearOrder.test.ts
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";
import { PlatformChannels } from "@zcode/shared";
import test from "node:test";

// host.ts 静态导入 electron(运行时);桩注入必须在动态 import 之前完成。
register(new URL("./support/stubResolver.mjs", import.meta.url));
const { stubSession, stubWebContents, stubIpcMain } = await import("./support/electronStub.mjs");

// 记录清理顺序(等价上游 vi.fn 的调用次序)。
const state = { order: [] };
stubSession.clearStorageData = async () => {
  state.order.push("clear");
};
stubSession.clearCache = async () => {
  state.order.push("cache");
};

// registerFromHost 经 webContents.fromId 验证 owner 存活;返回一个最小假 owner。
const ownerEmitters = new Map();
stubWebContents.fromId = (id) => ownerEmitters.get(id) ?? undefined;
ownerEmitters.set(1, {
  id: 1,
  isDestroyed: () => false,
  once() {},
  on() {},
  postMessage() {},
  send() {},
});

// host.ts 的 clearing 是闭包级标记且 clearBrowserData 不复位(上游靠 vi.resetModules
// 每 case 重建模块状态)。本仓用带版本号的动态 import 让每个 fixture 拿到新模块实例。
let hostImportVersion = 0;
async function loadPluginSandboxHost() {
  const url = new URL("../src/main/pluginSandbox/host.js", import.meta.url);
  url.searchParams.set("instance", String(++hostImportVersion));
  return (await import(url.href)).installPluginSandboxHost;
}

async function fixture() {
  const aliasDir = await mkdtemp(join(tmpdir(), "zcode-sandbox-clear-"));
  const navigation = Promise.withResolvers();
  const entered = Promise.withResolvers();
  const requested = Promise.withResolvers();
  let destroyed = false;
  const guest = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => destroyed,
    getURL() {
      return "zcode-sandbox://shell-fixture/instance/sb-1/";
    },
    loadURL(url) {
      assert.equal(url, "about:blank");
      state.order.push("navigate");
      entered.resolve();
      return navigation.promise;
    },
    close() {
      state.order.push("close");
      requested.resolve();
    },
    setWindowOpenHandler() {
      return { action: "deny" };
    },
    postMessage() {},
    send() {},
  });
  const installPluginSandboxHost = await loadPluginSandboxHost();
  const host = installPluginSandboxHost({
    rendererDir: "/fixture-renderer",
    aliasDir,
    preloadPath: "/fixture-preload",
    logger: { warn: () => undefined, info: () => undefined },
  });
  const handle = host.registerFromHost({
    instance: { runtimeId: "fixture", generation: 1, token: "one", appIdentity: "a".repeat(64) },
    ownerWebContentsId: 1,
    sessionId: "session",
    pluginId: "plugin",
    scopeId: "scope",
    serverName: "server",
    html: "<html></html>",
  });
  host.attachGuest({
    guest: guest,
    hostWebContents: {
      id: 1,
      isDestroyed: () => false,
      postMessage() {},
    },
    ...handle,
  });
  return {
    host,
    guest,
    navigation,
    entered,
    requested,
    dispose(initId = handle.initId) {
      const handler = stubIpcMain.handlers.get(PlatformChannels.PluginSandboxDispose);
      if (!handler) throw new Error("dispose handler not registered");
      return handler({ sender: { id: 1 } }, handle.sandboxId, initId);
    },
    destroy() {
      destroyed = true;
      state.order.push("destroyed");
      guest.emit("destroyed");
    },
  };
}

test.beforeEach(() => {
  state.order.length = 0;
});

test("clearOrder:等文档停止与 guest 关闭,清理期间登记封闭", async () => {
  const f = await fixture();
  const clearing = f.host.clearBrowserData();
  await f.entered.promise;
  assert.equal(state.order.includes("navigate"), true, "先导航到 about:blank");
  assert.equal(state.order.includes("close"), false, "导航未完成前不能 close");
  assert.equal(state.order.includes("clear"), false, "guest 关闭前不能清存储");
  // 清理进行中新的登记必须被拒绝(不能边清边注册)。
  assert.throws(
    () =>
      f.host.registerFromHost({
        instance: { runtimeId: "x", generation: 1, token: "y", appIdentity: "b".repeat(64) },
        ownerWebContentsId: 1,
        sessionId: "s2",
        scopeId: "scope2",
        html: "<html></html>",
      }),
    /being cleared/,
  );
  // guest 卸载意愿被拦截(防止 about:blank 导航被 beforeunload 卡住)。
  let prevented = false;
  f.guest.emit("will-prevent-unload", { preventDefault: () => (prevented = true) });
  f.navigation.resolve();
  await f.requested.promise;
  assert.equal(state.order.includes("clear"), false, "guest 销毁前不能清存储");
  f.destroy();
  await clearing;
  // 上游 vitest 用 mock 的 attachPluginSandboxGuest 记录 ports closed(关闭 MessagePort 对);
  // 本仓走真实 guestPolicy closer,其对假 guest 的端口关闭无观测点,断言按真实链路
  // 可见的顺序:navigate → close → destroyed → clear → cache。
  assert.deepEqual(state.order, ["navigate", "close", "destroyed", "clear", "cache"]);
  assert.equal(f.guest.listenerCount("will-prevent-unload"), 0);
  assert.throws(
    () =>
      f.host.registerFromHost({
        instance: { runtimeId: "x", generation: 1, token: "y", appIdentity: "b".repeat(64) },
        ownerWebContentsId: 1,
        sessionId: "s2",
        scopeId: "scope2",
        html: "<html></html>",
      }),
    /being cleared/,
  );
});

test("clearOrder:清理合并在途 dispose,不丢失仍在运行的 guest", async () => {
  const f = await fixture();
  let disposed = false;
  const disposal = Promise.resolve(f.dispose()).then(() => {
    disposed = true;
  });
  await f.entered.promise;
  const clearing = f.host.clearBrowserData();
  assert.equal(disposed, false, "dispose 尚未完成时清理不应抢跑");
  assert.equal(state.order.includes("clear"), false);
  f.navigation.resolve();
  await f.requested.promise;
  f.destroy();
  await Promise.all([clearing, disposal]);
  // dispose 与清理共用同一次"停文档→关 guest"流程:各只一次。
  assert.equal(state.order.filter((entry) => entry === "navigate").length, 1);
  assert.equal(state.order.filter((entry) => entry === "close").length, 1);
  assert.equal(state.order.filter((entry) => entry === "clear").length, 1);
  assert.equal(state.order.at(-1), "cache");
});

test("clearOrder:文档停不下来时清理失败,且不关 guest 不清存储", async () => {
  const f = await fixture();
  const clearing = f.host.clearBrowserData();
  const rejection = assert.rejects(clearing, /navigation failed/);
  await f.entered.promise;
  f.navigation.reject(new Error("navigation failed"));
  await rejection;
  assert.equal(state.order.includes("close"), false);
  assert.equal(state.order.includes("clear"), false);
  assert.equal(state.order.includes("cache"), false);
  assert.equal(f.guest.listenerCount("will-prevent-unload"), 0);
  assert.throws(
    () =>
      f.host.registerFromHost({
        instance: { runtimeId: "x", generation: 1, token: "y", appIdentity: "b".repeat(64) },
        ownerWebContentsId: 1,
        sessionId: "s2",
        scopeId: "scope2",
        html: "<html></html>",
      }),
    /being cleared/,
  );
});

test("clearOrder:webview 被真实移除导致的导航中止按成功处理", async () => {
  const f = await fixture();
  const clearing = f.host.clearBrowserData();
  await f.entered.promise;
  f.destroy();
  f.navigation.reject(new Error("ERR_ABORTED"));
  await clearing;
  assert.equal(state.order.includes("close"), false, "guest 已销毁不再 close");
  assert.equal(state.order.includes("clear"), true);
});

test("clearOrder:过期 initId 的 dispose 不启动停文档流程", async () => {
  const f = await fixture();
  await f.dispose(0);
  assert.equal(state.order.includes("navigate"), false);
  assert.equal(state.order.includes("close"), false);
  f.destroy();
});
