/**
 * OpenExternal 对本地 file: URL 的路由(X5,移植上游 v3.15.1)。
 *
 * 钉住的契约:OpenExternal IPC 处理器在 URL 通过协议白名单后,必须把 file: 协议
 * 路由到 openFileUrlInDefaultApp(fileURLToPath → openPath),而不是 shell.openExternal ——
 * 后者对本地文件 URL 在多数平台失败或无效,导致「用默认应用打开本地文件」入口失败。
 *
 * 运行:cd packages/desktop && node --import tsx --test test/desktopOpenExternalLocalFile.test.ts
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { register } from "node:module";
import test from "node:test";
import { PlatformChannels } from "@zcode/shared";

register(new URL("./support/stubResolver.mjs", import.meta.url));

const { registerRemoteIpcHandlers } = await import("../src/main/desktopMainIpcRemote.js");
const { stubShell } = await import("./support/electronStub.mjs");

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function createStubOptions() {
  return {
    logger,
    createRemoteWorkspaceSession: async () => "stub-session",
    disposeRemoteWorkspaceSession: () => undefined,
    cancelPendingRemoteWorkspaceSessionsForWindow: () => undefined,
    bindRemoteWorkspaceSessionContext: async () => undefined,
    confirmRendererAttachmentReady: () => undefined,
    isDockerDaemonAvailable: async () => false,
    listAvailableWSLDistros: async () => [],
    listAvailableDockerContainers: async () => [],
    listSSHConfigAliases: async () => [],
  };
}

test("file: URL 经 openFileUrlInDefaultApp 打开而不是 shell.openExternal", async () => {
  // 桩注入:直接从模块拿 ipcMain 命名导出后取监听器表。
  const { ipcMain } = await import("./support/electronStub.mjs");
  const listeners = /** @type {Map<string, Function>} */ (ipcMain.onListeners);
  const handler = listeners.get(PlatformChannels.OpenExternal);
  if (!handler) {
    // registerRemoteIpcHandlers 负责注册;未注册时先注册一次。
    registerRemoteIpcHandlers(createStubOptions());
  }
  const registered = /** @type {Function} */ (
    /** @type {Map<string, Function>} */ (ipcMain.onListeners).get(PlatformChannels.OpenExternal)
  );
  assert.ok(registered, "OpenExternal 监听器已注册");

  const tempDir = await mkdtemp(join(tmpdir(), "zcode-x5-"));
  const target = join(tempDir, "report.txt");
  await writeFile(target, "hello");
  stubShell.resetShellCalls();
  const event = {
    sender: { getURL: () => "https://app.zcode.dev/desktop", loadURL: undefined },
  };
  registered(event, { url: `file://${target}` });

  // openPathInDefaultApp 内含 realpath 真实异步 IO,轮询等它落定。
  const deadline = Date.now() + 2_000;
  while (stubShell.openPathCalls.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(stubShell.openExternalCalls.length, 0, "不得走 openExternal");
  assert.equal(stubShell.openPathCalls.length, 1, "应走 openPath");
  assert.equal(stubShell.openPathCalls[0], target);

  // http URL 行为不变:仍走 openExternal。
  stubShell.resetShellCalls();
  registered(event, { url: "https://example.com/page" });
  while (stubShell.openExternalCalls.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(stubShell.openExternalCalls.length, 1);
  assert.equal(stubShell.openPathCalls.length, 0);

  // 无效协议直接拒绝,两者都不调用。
  stubShell.resetShellCalls();
  registered(event, { url: "javascript:alert(1)" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(stubShell.openExternalCalls.length, 0);
  assert.equal(stubShell.openPathCalls.length, 0);

  await rm(tempDir, { recursive: true, force: true });
});
